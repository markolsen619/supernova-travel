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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  MagnifyingGlass,
  X,
  MapPin,
  ArrowRight,
  NavigationArrow,
} from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useSearch } from '@/hooks/useSearch';
import { usePlaceAutocomplete, PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { UserResult } from '@/components/search/UserResult';
import { TripResult } from '@/components/search/TripResult';
import { PlaceResult } from '@/components/search/PlaceResult';

type Tab = 'Places' | 'Users' | 'Trips';
const TABS: Tab[] = ['Places', 'Users', 'Trips'];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const WORLD_REGION = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 100,
  longitudeDelta: 100,
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9d9da8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c5c5d4' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e1e30' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#686880' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a40' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06060f' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a3a5c' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Places');
  const [selectedPlace, setSelectedPlace] = useState<PlaceSelection | null>(null);

  const mapRef = useRef<MapView>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const {
    setQuery: setPlacesQuery,
    suggestions: places,
    isLoading: placesLoading,
    error: placesError,
    selectPlace,
    clearQuery: clearPlacesQuery,
  } = usePlaceAutocomplete();

  const { users, trips, isSearching } = useSearch(query);

  const showBottomSheet = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const hideBottomSheet = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setPlacesQuery(text);
      if (text.length > 0) {
        showBottomSheet();
      } else {
        hideBottomSheet();
        setSelectedPlace(null);
        mapRef.current?.animateToRegion(WORLD_REGION, 800);
      }
    },
    [setPlacesQuery, showBottomSheet, hideBottomSheet],
  );

  const handleClearQuery = useCallback(() => {
    setQuery('');
    clearPlacesQuery();
    setSelectedPlace(null);
    hideBottomSheet();
    mapRef.current?.animateToRegion(WORLD_REGION, 800);
  }, [clearPlacesQuery, hideBottomSheet]);

  const handleTabPress = useCallback((tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  const handlePlacePress = useCallback(
    async (placeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const selection = await selectPlace(placeId);
        setSelectedPlace(selection);
        setQuery('');
        if (selection.lat !== null && selection.lng !== null) {
          mapRef.current?.animateToRegion(
            {
              latitude: selection.lat,
              longitude: selection.lng,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            },
            700,
          );
        }
        showBottomSheet();
      } catch {
        // silently ignore network errors
      }
    },
    [selectPlace, showBottomSheet],
  );

  const handlePlanTrip = useCallback(() => {
    if (!selectedPlace) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/trip/ai-generate',
      params: {
        destination: selectedPlace.name,
        countryCode: selectedPlace.countryCode ?? '',
        placeId: selectedPlace.placeId,
      },
    });
  }, [selectedPlace]);

  const handleDismissPlace = useCallback(() => {
    setSelectedPlace(null);
    if (query.length > 0) {
      showBottomSheet();
    } else {
      hideBottomSheet();
      mapRef.current?.animateToRegion(WORLD_REGION, 800);
    }
  }, [query, showBottomSheet, hideBottomSheet]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderEmptyState = (message: string) => (
    <View style={styles.emptyWrap}>
      <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>{message}</Text>
    </View>
  );

  const renderPlaces = () => {
    if (placesLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (placesError) return renderEmptyState('Search failed. Please try again.');
    if (!query.trim()) return renderEmptyState('Search for places, people, and trips');
    if (query.trim().length < 2) return renderEmptyState('Keep typing…');
    if (places.length === 0) return renderEmptyState(`No results for "${query}"`);
    return (
      <>
        {places.map((p) => (
          <PlaceResult
            key={p.placeId}
            placeId={p.placeId}
            mainText={p.mainText}
            secondaryText={p.secondaryText}
            onPress={handlePlacePress}
          />
        ))}
      </>
    );
  };

  const renderUsers = () => {
    if (!query.trim() || query.trim().length < 2) {
      return renderEmptyState(!query.trim() ? 'Search for places, people, and trips' : 'Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (users.length === 0) return renderEmptyState(`No results for "${query}"`);
    return (
      <>
        {users.map((u) => (
          <UserResult key={u.uid} user={u} onPress={() => router.push(`/user/${u.uid}`)} />
        ))}
      </>
    );
  };

  const renderTrips = () => {
    if (!query.trim() || query.trim().length < 2) {
      return renderEmptyState(!query.trim() ? 'Search for places, people, and trips' : 'Keep typing…');
    }
    if (isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (trips.length === 0) return renderEmptyState(`No results for "${query}"`);
    return (
      <>
        {trips.map((t) => (
          <TripResult key={t.id} trip={t} onPress={() => router.push(`/trip/${t.id}`)} />
        ))}
      </>
    );
  };

  const showingQuery = query.length > 0 && !selectedPlace;
  const bottomSheetVisible = showingQuery || selectedPlace !== null;

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={WORLD_REGION}
        customMapStyle={DARK_MAP_STYLE}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        pitchEnabled={false}
      >
        {selectedPlace?.lat !== null && selectedPlace?.lng !== null && selectedPlace && (
          <Marker
            coordinate={{
              latitude: selectedPlace.lat!,
              longitude: selectedPlace.lng!,
            }}
            pinColor="#a78bfa"
          />
        )}
      </MapView>

      {/* Floating top bar */}
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

        {/* Tab switcher — only when query is active and no place selected */}
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
                    backgroundColor:
                      activeTab === tab ? 'rgba(167,139,250,0.2)' : 'rgba(10,10,26,0.7)',
                    borderColor:
                      activeTab === tab ? colors.brand.purple : 'rgba(255,255,255,0.15)',
                  },
                ]}
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

      {/* Bottom sheet — results or selected place card */}
      {bottomSheetVisible && (
        <Animated.View
          style={[
            styles.bottomSheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={styles.bottomSheetInner}>
              <View style={styles.sheetHandle} />
              {selectedPlace
                ? renderPlaceCard()
                : renderResultsList()}
            </BlurView>
          ) : (
            <View style={[styles.bottomSheetInner, styles.bottomSheetAndroid]}>
              <View style={styles.sheetHandle} />
              {selectedPlace
                ? renderPlaceCard()
                : renderResultsList()}
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );

  function renderPlaceCard() {
    if (!selectedPlace) return null;
    return (
      <View style={[styles.placeCard, { paddingBottom: insets.bottom + Spacing['4'] }]}>
        <View style={styles.placeCardHeader}>
          <View style={styles.placeIconBubble}>
            <MapPin size={22} color="#a78bfa" weight="duotone" />
          </View>
          <View style={styles.placeCardText}>
            <Text style={[styles.placeName, { color: colors.text.primary }]} numberOfLines={1}>
              {selectedPlace.name}
            </Text>
            {selectedPlace.countryCode ? (
              <Text style={[styles.placeCountry, { color: colors.text.tertiary }]}>
                {selectedPlace.countryCode}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleDismissPlace} hitSlop={12} style={styles.dismissBtn}>
            <X size={18} color={colors.text.tertiary} weight="bold" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.planBtn, { backgroundColor: colors.brand.purple }]}
          onPress={handlePlanTrip}
          activeOpacity={0.85}
        >
          <NavigationArrow size={18} color="#ffffff" weight="bold" />
          <Text style={styles.planBtnText}>Plan a Trip Here</Text>
          <ArrowRight size={16} color="rgba(255,255,255,0.7)" weight="bold" />
        </TouchableOpacity>
      </View>
    );
  }

  function renderResultsList() {
    return (
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
    );
  }
}

// ── Search bar inner (reused for iOS blur + Android solid)

function SearchBarInner({
  query,
  onChangeText,
  onClear,
}: {
  query: string;
  onChangeText: (t: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.searchRow}>
      <MagnifyingGlass size={18} color="rgba(255,255,255,0.5)" weight="bold" />
      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={onChangeText}
        placeholder="Places, trips, people…"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={onClear} hitSlop={8}>
          <X size={16} color="rgba(255,255,255,0.5)" weight="bold" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },

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
    backgroundColor: 'rgba(10,10,26,0.9)',
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
    color: '#ffffff',
    paddingVertical: 0,
  },

  tabs: {
    gap: Spacing['2'],
  },
  tab: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

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
  bottomSheetInner: {
    flex: 1,
    minHeight: 180,
  },
  bottomSheetAndroid: {
    backgroundColor: 'rgba(10,10,26,0.96)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing['3'],
    marginBottom: Spacing['2'],
  },

  resultsList: { flex: 1 },

  placeCard: {
    padding: Spacing['5'],
    gap: Spacing['4'],
  },
  placeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  placeIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCardText: { flex: 1 },
  placeName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  placeCountry: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  dismissBtn: {
    padding: Spacing['2'],
  },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
  },
  planBtnText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
  },

  centered: { paddingTop: Spacing['8'], alignItems: 'center' },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing['10'],
    paddingHorizontal: Spacing['8'],
  },
  emptyText: { fontSize: FontSize.base, textAlign: 'center' },
});
