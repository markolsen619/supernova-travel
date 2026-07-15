import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  setAccessToken,
} from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlass, X, Compass, WarningCircle } from 'phosphor-react-native';
import { DarkColors } from '@/constants/colors';
import { useSearch } from '@/hooks/useSearch';
import { usePlaceAutocomplete, type PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { useFlyTo } from '@/hooks/useFlyTo';
import { usePlacesStore, type EnrichedPlace } from '@/stores/usePlacesStore';
import { enrichPoiByNameAndCoords, placeFromSelection, zoomForPlaceType } from '@/services/places/googlePlaces';
import { extractPoiFromFeatures } from '@/services/places/poiTapBridge';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { UserResult } from '@/components/search/UserResult';
import { TripResult } from '@/components/search/TripResult';
import { PlaceResult } from '@/components/search/PlaceResult';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type * as GeoJSON from 'geojson';

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
type ScreenPointPayload = { screenPointX: number; screenPointY: number };

// Set token once at module load — before any MapView renders
setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

type Tab = 'Places' | 'Users' | 'Trips';
const TABS: Tab[] = ['Places', 'Users', 'Trips'];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Initial camera: wide-angle globe view centred on 0°N 20°W
const INITIAL_ZOOM = 1.5;
const INITIAL_COORDS: [number, number] = [0, 20]; // [lng, lat]

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  // Always-dark immersive screen (Architecture Rule 3) — the globe is
  // atmosphere, not app chrome, so this hardcodes DarkColors rather than
  // following the (now light-by-default) theme.
  const colors = DarkColors;
  const { cameraRef, flyTo, flyToBounds } = useFlyTo();
  const mapRef = useRef<InstanceType<typeof MapView>>(null);

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Places');
  const [enriching, setEnriching] = useState(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const {
    selectedPlace,
    setSelectedPlace,
    getRecon,
    setRecon,
    getPlace,
    setPlace,
  } = usePlacesStore();

  // ── Algolia search (Users + Trips tabs) ───────────────────────────────────
  const { users, trips, isSearching } = useSearch(query);

  // ── Google Places autocomplete (Places tab) ───────────────────────────────
  // richDetails: true — the sheet always opens right after a selection here,
  // so the terminating Details call requests the Tier-2 mask directly (one
  // billed call instead of two: this call + the sheet's own upgrade fetch).
  const {
    setQuery: setPlacesQuery,
    suggestions: places,
    isLoading: placesLoading,
    error: placesError,
    selectPlace,
    clearQuery: clearPlacesQuery,
  } = usePlaceAutocomplete(350, { richDetails: true });

  // ── Bottom sheet animation ────────────────────────────────────────────────
  const showSheet = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const hideSheet = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  // ── Type-aware fly-in (Part A) ─────────────────────────────────────────────
  // Countries/regions/cities frame far more correctly against Google's viewport
  // than a guessed zoom; everything else (POIs, or a region with no viewport)
  // falls back to the zoom ladder keyed off primaryType.
  const flyToPlace = useCallback(
    (place: EnrichedPlace) => {
      if (place.viewport) {
        flyToBounds(place.viewport.ne, place.viewport.sw);
      } else {
        flyTo(place.lng, place.lat, zoomForPlaceType(place.primaryType));
      }
    },
    [flyTo, flyToBounds],
  );

  // ── Search bar ────────────────────────────────────────────────────────────
  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setPlacesQuery(text);
      if (text.length > 0) {
        showSheet();
      } else {
        hideSheet();
        setSelectedPlace(null);
      }
    },
    [setPlacesQuery, showSheet, hideSheet, setSelectedPlace],
  );

  const handleClearQuery = useCallback(() => {
    setQuery('');
    clearPlacesQuery();
    setSelectedPlace(null);
    hideSheet();
  }, [clearPlacesQuery, hideSheet, setSelectedPlace]);

  const handleTabPress = useCallback((tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  // ── Flow A: Google Places autocomplete item tap ───────────────────────────
  // Cheap path — one billed autocomplete session per search; no Text Search.
  const handlePlacePress = useCallback(
    async (placeId: string) => {
      // Navigation/selection (flies the camera, opens a read-only detail
      // sheet) — doesn't write anything, so Light, not Medium.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const sel: PlaceSelection = await selectPlace(placeId);
        const enriched = placeFromSelection(sel);
        if (!enriched) return;

        setPlace(enriched); // cache as tier1 for potential future tap upgrade
        setQuery('');
        setSelectedPlace(enriched);
        flyToPlace(enriched);
        showSheet();
      } catch {
        // network error — stay silent
      }
    },
    [selectPlace, setPlace, setSelectedPlace, flyToPlace, showSheet],
  );

  // ── Flow B: Mapbox ambient POI tap ────────────────────────────────────────
  // Cache-first: reconciliation → place-detail → Text Search (Tier 2) on miss.
  const handleMapPress = useCallback(
    async (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => {
      const { screenPointX, screenPointY } = feature.properties;
      const [tapLng, tapLat] = feature.geometry.coordinates;

      const collection = await mapRef.current?.queryRenderedFeaturesAtPoint([
        screenPointX,
        screenPointY,
      ]);
      const poi = extractPoiFromFeatures(collection, tapLat, tapLng);
      if (!poi) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      console.log('[POI tap]', poi.name, poi.lat, poi.lng);

      // 1. Reconciliation cache: do we already know the placeId for this POI?
      const cachedId = getRecon(poi.cacheKey);
      if (cachedId) {
        const cached = getPlace(cachedId);
        if (cached?.tier === 'tier2') {
          console.log('[POI tap] cache hit (tier2) →', cachedId);
          setSelectedPlace(cached);
          flyToPlace(cached);
          showSheet();
          return;
        }
      }

      // 2. Cache miss (or only tier1) → Text Search (Tier 2 field mask)
      setEnriching(true);
      try {
        const enriched = await enrichPoiByNameAndCoords(poi.name, poi.lat, poi.lng);
        if (!enriched) return;

        setRecon(poi.cacheKey, enriched.placeId);
        setPlace(enriched);
        setSelectedPlace(enriched);
        flyToPlace(enriched);
        showSheet();
      } catch {
        // network error — silent
      } finally {
        setEnriching(false);
      }
    },
    [getRecon, getPlace, setRecon, setPlace, setSelectedPlace, flyToPlace, showSheet],
  );

  const handleDismissPlace = useCallback(() => {
    setSelectedPlace(null);
    if (query.length > 0) {
      showSheet();
    } else {
      hideSheet();
    }
  }, [query, setSelectedPlace, showSheet, hideSheet]);

  // ── Render helpers ────────────────────────────────────────────────────────
  // Hand-rolled, not the shared EmptyState component — EmptyState calls
  // useTheme() internally and would render LIGHT if the app theme is light,
  // which is wrong floating over this screen's always-dark globe.
  const renderEmptyState = (
    icon: React.ComponentType<{ size: number; color: string; weight: 'duotone' | 'regular' }>,
    title: string,
    description?: string,
  ) => {
    const Icon = icon;
    return (
      <View style={styles.emptyWrap}>
        <Icon size={28} color={colors.text.disabled} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>{title}</Text>
        {description ? (
          <Text style={[styles.emptyDescription, { color: colors.text.tertiary }]}>{description}</Text>
        ) : null}
      </View>
    );
  };

  const renderPlaces = () => {
    if (placesLoading) {
      // Fast (350ms-debounced) autocomplete — a skeleton would flash in and
      // out faster than it reads; a small spinner is the better fit here.
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (placesError) return renderEmptyState(WarningCircle, 'Search failed', 'Check your connection and try again.');
    if (!query.trim()) return renderEmptyState(Compass, 'Search the map', 'Find places, people, and trips.');
    if (query.trim().length < 2) return renderEmptyState(MagnifyingGlass, 'Keep typing…');
    if (places.length === 0) return renderEmptyState(MagnifyingGlass, `No results for "${query}"`);
    return (
      <>
        {places.map((p) => (
          <PlaceResult
            key={p.placeId}
            placeId={p.placeId}
            mainText={p.mainText}
            secondaryText={p.secondaryText}
            onPress={handlePlacePress}
            colors={DarkColors}
          />
        ))}
      </>
    );
  };

  const renderUsers = () => {
    if (!query.trim()) return renderEmptyState(Compass, 'Search the map', 'Find places, people, and trips.');
    if (query.trim().length < 2) return renderEmptyState(MagnifyingGlass, 'Keep typing…');
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (users.length === 0) return renderEmptyState(MagnifyingGlass, `No results for "${query}"`);
    return (
      <>
        {users.map((u) => (
          <UserResult key={u.uid} user={u} onPress={() => router.push(`/user/${u.uid}`)} />
        ))}
      </>
    );
  };

  const renderTrips = () => {
    if (!query.trim()) return renderEmptyState(Compass, 'Search the map', 'Find places, people, and trips.');
    if (query.trim().length < 2) return renderEmptyState(MagnifyingGlass, 'Keep typing…');
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (trips.length === 0) return renderEmptyState(MagnifyingGlass, `No results for "${query}"`);
    return (
      <>
        {trips.map((t) => (
          <TripResult key={t.id} trip={t} onPress={() => router.push(`/trip/${t.id}`)} />
        ))}
      </>
    );
  };

  const showingQuery = query.length > 0 && !selectedPlace;

  return (
    <View style={styles.container}>
      {/* ── Mapbox Standard globe ─────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        projection="globe"
        onPress={handleMapPress}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
      >
        <StyleImport
          id="basemap"
          existing
          config={{
            lightPreset: 'night',
            showPointOfInterestLabels: true,
            showLandmarkIcons: true,
            show3dBuildings: true,
          }}
        />
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: INITIAL_COORDS,
            zoomLevel: INITIAL_ZOOM,
          }}
          animationMode="none"
        />
      </MapView>

      {/* ── Floating search bar ───────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing['2'] }]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={60} tint="dark" style={styles.searchBarBlur}>
            <SearchBarInner
              query={query}
              onChangeText={handleQueryChange}
              onClear={handleClearQuery}
            />
          </BlurView>
        ) : (
          <View style={styles.searchBarAndroid}>
            <SearchBarInner
              query={query}
              onChangeText={handleQueryChange}
              onClear={handleClearQuery}
            />
          </View>
        )}

        {showingQuery && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => handleTabPress(tab)}
                style={[
                  styles.tab,
                  {
                    // Tied to colors.background.primary (the same dark void
                    // token the globe/other floating chrome uses) rather than
                    // an independently-invented rgba(10,10,26,…) — deliberate,
                    // not a scattered magic number.
                    backgroundColor:
                      activeTab === tab ? `${colors.brand.purple}33` : `${colors.background.primary}B3`,
                    borderColor:
                      activeTab === tab ? colors.brand.purple : 'rgba(255,255,255,0.15)',
                  },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityLabel={`${tab} tab`}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeTab === tab ? colors.brand.purple : colors.text.tertiary },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Enriching spinner ─────────────────────────────────────────────── */}
      {enriching && (
        <View style={[styles.enrichingBadge, { backgroundColor: `${colors.background.primary}D9` }]}>
          <ActivityIndicator size="small" color={colors.text.primary} />
        </View>
      )}

      {/* ── Search results bottom sheet ───────────────────────────────────── */}
      {showingQuery && (
        <Animated.View
          style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={styles.bottomSheetInner}>
              <View style={styles.sheetHandle} />
              <ScrollView
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['6'] }}
              >
                {activeTab === 'Places' && renderPlaces()}
                {activeTab === 'Users' && renderUsers()}
                {activeTab === 'Trips' && renderTrips()}
              </ScrollView>
            </BlurView>
          ) : (
            <View style={[styles.bottomSheetInner, styles.bottomSheetAndroid]}>
              <View style={styles.sheetHandle} />
              <ScrollView
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['6'] }}
              >
                {activeTab === 'Places' && renderPlaces()}
                {activeTab === 'Users' && renderUsers()}
                {activeTab === 'Trips' && renderTrips()}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      )}

      {/* ── Place detail sheet ────────────────────────────────────────────── */}
      {selectedPlace && (
        <PlaceDetailSheet
          place={selectedPlace}
          slideAnim={slideAnim}
          bottomInset={insets.bottom}
          onDismiss={handleDismissPlace}
          colors={DarkColors}
        />
      )}
    </View>
  );
}

// ── Search bar inner ──────────────────────────────────────────────────────────

function SearchBarInner({
  query,
  onChangeText,
  onClear,
}: {
  query: string;
  onChangeText: (t: string) => void;
  onClear: () => void;
}) {
  const colors = DarkColors;
  return (
    <View style={styles.searchRow}>
      <MagnifyingGlass size={18} color={colors.text.secondary} weight="bold" />
      <TextInput
        style={[styles.searchInput, { color: colors.text.primary }]}
        value={query}
        onChangeText={onChangeText}
        placeholder="Places, trips, people…"
        placeholderTextColor={colors.text.tertiary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {query.length > 0 && (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityLabel="Clear search"
        >
          <X size={16} color={colors.text.secondary} weight="bold" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// DarkColors is a static import (this screen never resolves the runtime
// theme — see Architecture Rule 3), so these derived tones are safe to
// compute once at module scope rather than re-deriving inline per render.
const DARK_SCRIM_90 = `${DarkColors.background.primary}E6`;
const DARK_SCRIM_96 = `${DarkColors.background.primary}F5`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DarkColors.background.primary },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Spacing['4'],
    gap: Spacing['2'],
    paddingBottom: Spacing['2'],
  },
  // Translucent white border, not a DarkColors token — this is a glass edge
  // meant to catch light over an unpredictable map/satellite background, the
  // same reasoning as the trip header's photo-overlay buttons. Deliberate,
  // not a leftover magic number.
  searchBarBlur: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  searchBarAndroid: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: DARK_SCRIM_90,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2'],
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    paddingVertical: 0,
  },

  tabs: { gap: Spacing['2'] },
  tab: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.55,
    borderTopLeftRadius: BorderRadius['2xl'] ?? 24,
    borderTopRightRadius: BorderRadius['2xl'] ?? 24,
    overflow: 'hidden',
  },
  bottomSheetInner: { flex: 1, minHeight: 180 },
  bottomSheetAndroid: { backgroundColor: DARK_SCRIM_96 },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: DarkColors.text.disabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing['3'],
    marginBottom: Spacing['2'],
  },
  resultsList: { flex: 1 },

  enrichingBadge: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    borderRadius: 20,
    padding: Spacing['3'],
    zIndex: 20,
  },

  centered: { paddingTop: Spacing['8'], alignItems: 'center' },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['10'],
    paddingHorizontal: Spacing['8'],
    gap: Spacing['1'],
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
    marginTop: Spacing['2'],
  },
  emptyDescription: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
