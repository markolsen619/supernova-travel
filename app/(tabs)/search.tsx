import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  type LayoutChangeEvent,
} from 'react-native';
import { MapView } from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlass, X, Compass, WarningCircle, MapPin, Globe } from 'phosphor-react-native';
import {
  Gesture,
  GestureDetector,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { DarkColors } from '@/constants/colors';
import { useSearch } from '@/hooks/useSearch';
import { useTrendingPlaces } from '@/hooks/useTrendingPlaces';
import { usePlaceAutocomplete, type PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { useFlyTo } from '@/hooks/useFlyTo';
import { usePlacesStore, type EnrichedPlace } from '@/stores/usePlacesStore';
import { enrichPoiByNameAndCoords, placeFromSelection, zoomForPlaceType, searchNearbyPlaces } from '@/services/places/googlePlaces';
import { lightPresetForNow, type LightPreset } from '@/services/mapLighting';
import { extractPoiFromFeatures } from '@/services/places/poiTapBridge';
import { tapBbox, shouldFallbackToNearby, nearbyRadiusForZoom } from '@/utils/mapInteraction';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { UserResult } from '@/components/search/UserResult';
import { TripResult } from '@/components/search/TripResult';
import { PlaceResult } from '@/components/search/PlaceResult';
import { GlobeMapView, INITIAL_ZOOM, INITIAL_COORDS, type ScreenPointPayload } from '@/components/search/GlobeMapView';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING, Duration, fadeTo } from '@/constants/motion';
import type * as GeoJSON from 'geojson';

type Tab = 'Places' | 'Users' | 'Trips';
const TABS: Tab[] = ['Places', 'Users', 'Trips'];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Two positions: expanded (current behaviour) and peek, which leaves the map
// visible behind roughly two result rows.
const SHEET_PEEK_Y = SCREEN_HEIGHT * 0.35;
const SHEET_EXPANDED_Y = 0;
// The sheet's height is content-driven (bottomSheetInner minHeight: 180, up
// to BOTTOM_SHEET_MAX_HEIGHT below) — SHEET_PEEK_Y is an absolute
// translation, so a short sheet (a two-row nearby list, an empty state) can
// translate fully off-screen at "peek", stranding the user with no visible
// gesture target. The actual peek target is clamped against the sheet's
// measured height so at least this many points stay on screen.
const SHEET_PEEK_MIN_VISIBLE = 96;
// Shared between the style below and the pre-layout fallback so they can't
// drift apart.
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.55;

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
  // Results of a tap that hit no rendered POI. Rendered in the sheet under
  // "Places near here" — reusing PlaceResult rows rather than a new chooser.
  const [nearbyResults, setNearbyResults] = useState<EnrichedPlace[] | null>(null);
  // Live zoom, kept in a ref because onCameraChanged fires continuously
  // through a pinch — see Task 9 for why this must not be state.
  const zoomRef = useRef(INITIAL_ZOOM);
  // Only the threshold crossing reaches React — at most twice per gesture,
  // rather than once per frame. Drives the back-to-globe button.
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  // Screen point of the last tap, for the pulse. Null when no pulse is running.
  const [pulseAt, setPulseAt] = useState<{ x: number; y: number } | null>(null);
  const pulseScale = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  // Light→dark reveal on focus (design system: "the light-to-dark transition
  // is a signature moment — fade/scale it, never hard-cut"). No reverse on
  // blur: tab swaps away are immediate, and an exit animation would delay
  // the next screen appearing.
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const revealScale = useRef(new Animated.Value(1.04)).current;

  // Standard's lighting follows the actual time of day. Recomputed three
  // ways, deliberately redundant: on mount (a plain useEffect, NOT just the
  // useState initializer — React preserves local state across Fast Refresh,
  // so an initializer-only value can survive stale indefinitely through
  // however many JS reloads happen during a dev session), on tab focus (a
  // session left on another tab across a preset boundary catches up), and
  // on a 10-minute interval (a session left sitting on this tab catches up
  // too, without needing to leave and return). The floating chrome stays
  // the fixed dark treatment (self-contained dark surfaces with light
  // text), which reads over all four presets.
  const [lightPreset, setLightPreset] = useState<LightPreset>(() => lightPresetForNow());
  useEffect(() => {
    setLightPreset(lightPresetForNow());
    const interval = setInterval(() => setLightPreset(lightPresetForNow()), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  useFocusEffect(
    useCallback(() => {
      setLightPreset(lightPresetForNow());

      // Reset (not just animate) each focus, or the reveal only ever plays
      // once — on first mount — and never again on subsequent visits to the
      // tab, which is the common case in real use.
      revealOpacity.setValue(1);
      revealScale.setValue(1.04);
      Animated.parallel([
        fadeTo(revealOpacity, 0, Duration.slow),
        Animated.spring(revealScale, { toValue: 1, ...SPRING }),
      ]).start();
      // No reverse on blur: tab swaps away are immediate, and an exit
      // animation would delay the next screen appearing.
    }, [revealOpacity, revealScale]),
  );

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // PlaceDetailSheet gets its own value rather than sharing slideAnim.
  // showSheet/hideSheet drive both values together, but the pan gesture below
  // drives slideAnim ALONE — if the two sheets shared one value, dragging the
  // results sheet would also drag PlaceDetailSheet, which has no drag handle
  // of its own to explain why it moved. The two also have different heights,
  // so one set of snap points can't serve both. (The two are not currently
  // reachable mounted together — handleMapPress's nearby.length === 1 branch
  // clears any stale nearbyResults before selecting — but that guard is not
  // what this separation depends on; the reasons above hold either way.)
  const detailSlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // Initialised to SCREEN_HEIGHT, matching slideAnim's own initial value
  // (the sheet starts hidden). Seeding this to 0 instead would make the
  // first drag jump a full screen. Written directly by the pan gesture
  // below, so it can't be read back from slideAnim synchronously.
  const sheetBaseY = useRef(SCREEN_HEIGHT);
  const scrollRef = useRef(null);
  // Measured on every layout of the sheet (content-driven height, capped by
  // BOTTOM_SHEET_MAX_HEIGHT). Seeded to that same cap so the pre-layout
  // fallback assumes the tallest the sheet can be — the safe direction: it
  // reproduces today's peek position (SHEET_PEEK_Y) rather than prematurely
  // shrinking peek for a sheet that might turn out to be tall. A ref, not
  // state, for the same reason sheetBaseY is a ref: read inside the pan
  // gesture's onEnd without forcing panGesture to rebuild on every layout.
  const sheetHeightRef = useRef(BOTTOM_SHEET_MAX_HEIGHT);
  const handleSheetLayout = useCallback((e: LayoutChangeEvent) => {
    sheetHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const {
    selectedPlace,
    setSelectedPlace,
    getRecon,
    setRecon,
    getPlace,
    setPlace,
    getNearby,
    setNearby,
  } = usePlacesStore();

  // ── Algolia search (Users + Trips tabs) ───────────────────────────────────
  const { users, trips, isSearching } = useSearch(query);

  // ── Trending destination pins (world-zoom scannability) ───────────────────
  const { places: trendingPlaces } = useTrendingPlaces();

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
  // Both slideAnim (results sheet) and detailSlideAnim (PlaceDetailSheet) are
  // driven together here, since every call site means "show/hide whichever
  // sheet applies" rather than picking one — only the drag gesture below
  // touches slideAnim on its own.
  const showSheet = useCallback(() => {
    sheetBaseY.current = SHEET_EXPANDED_Y;
    Animated.spring(slideAnim, { toValue: SHEET_EXPANDED_Y, ...SPRING }).start();
    Animated.spring(detailSlideAnim, { toValue: SHEET_EXPANDED_Y, ...SPRING }).start();
  }, [slideAnim, detailSlideAnim]);

  const hideSheet = useCallback(() => {
    sheetBaseY.current = SCREEN_HEIGHT;
    Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT, ...SPRING }).start();
    Animated.spring(detailSlideAnim, { toValue: SCREEN_HEIGHT, ...SPRING }).start();
  }, [slideAnim, detailSlideAnim]);

  // Drag the results sheet between expanded and peek. simultaneousWithExternalGesture
  // is wired from the start (not tuned to iOS alone) — Android resolves
  // pan-over-scroll composition differently, and the Android pass should be a
  // test, not a redesign.
  // Memoised: the only reactive value the closures below touch is slideAnim,
  // which is a useRef(...).current — a stable object identity for the life
  // of the component — so this never needs to rebuild. sheetBaseY,
  // sheetHeightRef, and scrollRef are refs (read via .current inside the
  // handlers, so mutating them doesn't require rebuilding this either).
  // Rebuilding on every render would tear down and reattach the native
  // gesture handler each time,
  // which is the thing to avoid — a wrong dep list here would either defeat
  // that (rebuild every render anyway) or capture stale snap-point state
  // worse than not memoising at all, but neither risk applies since nothing
  // captured here actually varies across renders.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // .runOnJS(true) is required, not stylistic: this screen drives the
        // sheet with plain React Native `Animated` (slideAnim.setValue,
        // Animated.spring(...).start()) and a plain ref (sheetBaseY), none
        // of which are Reanimated shared values or worklet-safe. But
        // react-native-reanimated/plugin (babel.config.js) auto-workletizes
        // every .onUpdate/.onEnd callback on a Gesture.*() chain regardless
        // of what it references, so without this the callbacks run on the
        // UI thread, `Animated`/`sheetBaseY.current` calls throw a
        // ReanimatedError, and sheetBaseY's mutation never reaches the JS
        // thread anyway. Do not remove this as "redundant" — it is load-
        // bearing, not a default.
        .runOnJS(true)
        .simultaneousWithExternalGesture(scrollRef)
        .onUpdate((e) => {
          const next = sheetBaseY.current + e.translationY;
          slideAnim.setValue(Math.max(SHEET_EXPANDED_Y, Math.min(SCREEN_HEIGHT, next)));
        })
        .onEnd((e) => {
          // Clamp against the sheet's own measured height, or a short sheet
          // (a two-row nearby list, an empty state) would translate fully
          // off-screen at "peek" — still mounted, still gesture-target-less.
          const peekTarget = Math.max(
            SHEET_EXPANDED_Y,
            Math.min(SHEET_PEEK_Y, sheetHeightRef.current - SHEET_PEEK_MIN_VISIBLE),
          );
          // Velocity decides, so a flick works as well as a long drag.
          const target =
            e.velocityY > 500
              ? peekTarget
              : e.velocityY < -500
                ? SHEET_EXPANDED_Y
                : sheetBaseY.current + e.translationY > peekTarget / 2
                  ? peekTarget
                  : SHEET_EXPANDED_Y;
          sheetBaseY.current = target;
          Animated.spring(slideAnim, { toValue: target, ...SPRING }).start();
        }),
    [slideAnim],
  );

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

  // ── Camera zoom tracking (Task 9) ─────────────────────────────────────────
  // onCameraChanged fires continuously through a pinch/pan — many times per
  // second. Storing the raw zoom in state would re-render the whole screen
  // every frame of every gesture. The value lives in zoomRef (Task 5's
  // fallback-to-nearby gate reads it); only the boolean threshold crossing
  // is lifted into state, and the functional setState skips the update
  // entirely when the boolean hasn't changed.
  const handleCameraChanged = useCallback((zoom: number) => {
    zoomRef.current = zoom;
    const next = zoom > 6;
    setIsZoomedIn((prev) => (prev === next ? prev : next));
  }, []);

  const handleBackToGlobe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlace(null);
    setNearbyResults(null);
    hideSheet();
    // flyTo applies pitchForZoom/headingForArrival internally; INITIAL_ZOOM
    // is below the pitch threshold, so this also resets pitch to 0 — no
    // separate reset needed.
    flyTo(INITIAL_COORDS[0], INITIAL_COORDS[1], INITIAL_ZOOM);
  }, [setSelectedPlace, hideSheet, flyTo]);

  // ── Search bar ────────────────────────────────────────────────────────────
  const handleQueryChange = useCallback(
    (text: string) => {
      setNearbyResults(null);
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
    setNearbyResults(null);
    setQuery('');
    clearPlacesQuery();
    setSelectedPlace(null);
    hideSheet();
    // Clearing the search is the map's "reset" gesture — fly back out to the
    // wide globe view rather than leaving the camera wherever the last
    // search happened to land it.
    flyTo(INITIAL_COORDS[0], INITIAL_COORDS[1], INITIAL_ZOOM);
  }, [clearPlacesQuery, hideSheet, setSelectedPlace, flyTo]);

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

  // Visible tap acknowledgement — a haptic alone can be suppressed (silent
  // switch) or coarsened (Android), so the ring is the reliable half.
  const firePulse = useCallback(
    (x: number, y: number) => {
      setPulseAt({ x, y });
      pulseScale.setValue(0);
      pulseOpacity.setValue(0.5);
      Animated.parallel([
        Animated.spring(pulseScale, { toValue: 1, ...SPRING }),
        fadeTo(pulseOpacity, 0, Duration.base),
      ]).start(() => setPulseAt(null));
    },
    [pulseScale, pulseOpacity],
  );

  // Nearby Search + result branching, shared by two callers: a tap that hit
  // no rendered feature at all, and (Section 6b) a tap that hit a POI
  // feature whose Text Search resolution came back empty or errored — both
  // are "we don't have an exact answer for this tap", and both deserve the
  // same honest fallback rather than one of them going silent.
  const runNearbySearchFallback = useCallback(
    async (lat: number, lng: number, zoom: number) => {
      // Coordinate-keyed cache: the results sheet has no dismiss
      // affordance, so tapping the map to close it re-enters this exact
      // path — without this, that dismiss-tap re-bills a Nearby Search
      // every time. Cache hit resolves synchronously, so it never shows
      // the enriching spinner (there's nothing to wait for).
      const cached = getNearby(lat, lng);
      let nearby: EnrichedPlace[];
      if (cached) {
        nearby = cached;
      } else {
        setEnriching(true);
        try {
          nearby = await searchNearbyPlaces(lat, lng, nearbyRadiusForZoom(zoom));
          setNearby(lat, lng, nearby);
        } finally {
          setEnriching(false);
        }
      }

      if (nearby.length === 1) {
        // One obvious answer — skip the list and select it directly.
        // Clear any nearby list from a PREVIOUS tap first: without this,
        // a multi-result tap followed by a single-result tap leaves both
        // sheets mounted, and dismissing the detail sheet reveals a stale
        // list from two taps ago.
        setNearbyResults(null);
        setPlace(nearby[0]);
        setSelectedPlace(nearby[0]);
        flyToPlace(nearby[0]);
        showSheet();
        return;
      }

      // Zero results still opens the sheet: an honest empty state beats
      // the silence this branch used to produce.
      nearby.forEach((p) => setPlace(p));
      setNearbyResults(nearby);
      setSelectedPlace(null);
      // A map tap always produces place results, so force the Places tab —
      // activeTab survives handleClearQuery, and a stale Users/Trips tab would
      // render its own empty state over real nearby results.
      setActiveTab('Places');
      showSheet();
    },
    [getNearby, setNearby, setPlace, setSelectedPlace, flyToPlace, showSheet, setNearbyResults, setActiveTab],
  );

  // ── Flow B: Mapbox ambient POI tap ────────────────────────────────────────
  // Cache-first: reconciliation → place-detail → Text Search (Tier 2) on miss.
  const handleMapPress = useCallback(
    async (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => {
      const { screenPointX, screenPointY } = feature.properties;
      const [tapLng, tapLat] = feature.geometry.coordinates;

      // Acknowledge the tap in the same frame it happens, before any await.
      // Whether it resolves to a POI, to nearby results, or to nothing, the
      // user must never wonder if the tap registered.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      firePulse(screenPointX, screenPointY);

      // Logged unconditionally (not just on a POI hit) — distinguishes "the
      // tap never registered" from "it registered but found no POI feature
      // at that point" (e.g. zoomed too far out for Standard to render POI
      // labels), which previously looked identical from the outside.
      console.log('[Map tap]', { screenPointX, screenPointY, tapLat, tapLng, hasRef: !!mapRef.current });

      const collection = await mapRef.current?.queryRenderedFeaturesInRect(
        tapBbox(screenPointX, screenPointY),
      );
      const poi = extractPoiFromFeatures(collection, tapLat, tapLng);
      if (!poi) {
        console.log('[Map tap] no POI feature at this point —', collection?.features?.length ?? 0, 'features found');

        const zoom = zoomRef.current;

        // Below the gate a tap covers hundreds of kilometres, so any nearby
        // result would be arbitrary — and billed. Flying in is the useful
        // reading of a tap on a far-out map.
        if (!shouldFallbackToNearby(zoom)) {
          flyTo(tapLng, tapLat, Math.min(zoom + 3, 12.5));
          return;
        }

        await runNearbySearchFallback(tapLat, tapLng, zoom);
        return;
      }

      // A real POI was found — drop any stale nearby list.
      setNearbyResults(null);
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
      let enriched: EnrichedPlace | null = null;
      try {
        enriched = await enrichPoiByNameAndCoords(poi.name, poi.lat, poi.lng);
      } catch (err) {
        console.log('[POI tap] Text Search failed —', err);
      } finally {
        setEnriching(false);
      }

      if (enriched) {
        setRecon(poi.cacheKey, enriched.placeId);
        setPlace(enriched);
        setSelectedPlace(enriched);
        flyToPlace(enriched);
        showSheet();
        return;
      }

      // A feature was found and named, but Text Search couldn't resolve it
      // (or the request errored) — going silent here recreates the exact
      // dead-tap this project exists to remove. Fall through to the same
      // nearby-search behaviour a miss gets, respecting the same zoom gate:
      // below it, a nearby search would be as arbitrary and billed as it is
      // in the miss case, so show the honest empty state instead of firing
      // one.
      console.log('[POI tap] Text Search found nothing for', poi.name, '— falling back to nearby search');
      const zoom = zoomRef.current;
      if (shouldFallbackToNearby(zoom)) {
        await runNearbySearchFallback(poi.lat, poi.lng, zoom);
      } else {
        setNearbyResults([]);
        setSelectedPlace(null);
        setActiveTab('Places');
        showSheet();
      }
    },
    [getRecon, getPlace, setRecon, setPlace, setSelectedPlace, flyToPlace, showSheet, flyTo, setNearbyResults, setActiveTab, firePulse, runNearbySearchFallback],
  );

  // ── Flow C: nearby-results row tap ────────────────────────────────────────
  // Already tier2-enriched and cached by handleMapPress — goes straight to
  // getPlace rather than handlePlacePress, which would spend a second billed
  // Details call re-fetching data already in hand.
  const handleNearbyPress = useCallback(
    (placeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const place = getPlace(placeId);
      if (!place) return;
      setNearbyResults(null);
      setSelectedPlace(place);
      flyToPlace(place);
      showSheet();
    },
    [getPlace, setSelectedPlace, flyToPlace, showSheet],
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

    // A tap that fell through to Nearby Search owns the sheet until the user
    // searches or selects — checked before the query-empty branch, which
    // would otherwise show "Search the map" over real results.
    if (nearbyResults !== null) {
      if (nearbyResults.length === 0) {
        return renderEmptyState(
          MapPin,
          'No places found here',
          'Try tapping closer to a building or label.',
        );
      }
      return (
        <>
          <Text style={[styles.sheetHeading, { color: colors.text.tertiary }]}>
            PLACES NEAR HERE
          </Text>
          {nearbyResults.map((p) => (
            <PlaceResult
              key={p.placeId}
              placeId={p.placeId}
              mainText={p.name}
              secondaryText={p.address}
              onPress={handleNearbyPress}
              colors={DarkColors}
            />
          ))}
        </>
      );
    }

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
  // A nearby-results miss has no query text, so it can't ride showingQuery —
  // without this the results sheet would never mount and the fallback would
  // be just as silent as the miss it replaces. Tabs stay keyed off
  // showingQuery alone: switching to Users/Trips mid-nearby-list isn't a
  // real use case, and Task 10's idle-eyebrow condition checks nearbyResults
  // separately from showingQuery, so this stays additive rather than folded in.
  const showingSheet = showingQuery || nearbyResults !== null;

  return (
    <View style={styles.container}>
      {/* ── Mapbox Standard globe ─────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: revealScale }] }]}>
        <GlobeMapView
          cameraRef={cameraRef}
          mapRef={mapRef}
          lightPreset={lightPreset}
          onPress={handleMapPress}
          onCameraChanged={handleCameraChanged}
          trendingPlaces={trendingPlaces}
          selectedPlace={selectedPlace}
        />
      </Animated.View>

      {pulseAt && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tapPulse,
            {
              left: pulseAt.x - 22,
              top: pulseAt.y - 22,
              borderColor: colors.brand.purple,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      )}

      {/* ── Eyebrow label (idle only) ─────────────────────────────────────── */}
      {!showingQuery && !selectedPlace && nearbyResults === null && (
        <View style={[styles.eyebrowWrap, { paddingTop: insets.top + 68 }]} pointerEvents="none">
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>
            {trendingPlaces.length > 0
              ? `TRENDING NOW · ${trendingPlaces.length} PLACES`
              : 'TRENDING NOW'}
          </Text>
        </View>
      )}

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
                    backgroundColor: `${colors.background.primary}B3`,
                    borderColor:
                      activeTab === tab ? colors.brand.purple : colors.background.cardBorder,
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

      {/* ── Back to globe ─────────────────────────────────────────────────── */}
      {isZoomedIn && (
        <TouchableOpacity
          onPress={handleBackToGlobe}
          style={[
            styles.globeButton,
            {
              // 128, not 96. The Mapbox logo and attribution sit at a FIXED
              // bottom: 88 and are not inset-aware, so on a device with a
              // small or zero bottom inset a 96 offset puts this button on
              // top of them. Attribution is required by Mapbox's terms, so
              // this must clear it on every device, not just notched ones.
              bottom: insets.bottom + 128,
              backgroundColor: `${colors.background.primary}D9`,
              borderColor: colors.background.cardBorder,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to globe"
        >
          <Globe size={20} color={colors.text.primary} weight="duotone" />
        </TouchableOpacity>
      )}

      {/* ── Search results bottom sheet ───────────────────────────────────── */}
      {showingSheet && (
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
            onLayout={handleSheetLayout}
          >
            {Platform.OS === 'ios' ? (
              <BlurView intensity={80} tint="dark" style={styles.bottomSheetInner}>
                <View style={styles.sheetHandle} />
                {/* GestureScrollView (react-native-gesture-handler), not RN's
                    ScrollView: simultaneousWithExternalGesture(scrollRef) above
                    reads ref.current.handlerTag, which only RNGH's ScrollView
                    exposes — a plain RN ScrollView ref has no handlerTag, so
                    the simultaneous-gesture list would silently resolve to
                    empty and the sheet drag / list scroll would fight. */}
                <GestureScrollView
                  ref={scrollRef}
                  style={styles.resultsList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['6'] }}
                >
                  {activeTab === 'Places' && renderPlaces()}
                  {activeTab === 'Users' && renderUsers()}
                  {activeTab === 'Trips' && renderTrips()}
                </GestureScrollView>
              </BlurView>
            ) : (
              <View style={[styles.bottomSheetInner, styles.bottomSheetAndroid]}>
                <View style={styles.sheetHandle} />
                <GestureScrollView
                  ref={scrollRef}
                  style={styles.resultsList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['6'] }}
                >
                  {activeTab === 'Places' && renderPlaces()}
                  {activeTab === 'Users' && renderUsers()}
                  {activeTab === 'Trips' && renderTrips()}
                </GestureScrollView>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}

      {/* ── Place detail sheet ────────────────────────────────────────────── */}
      {selectedPlace && (
        <PlaceDetailSheet
          place={selectedPlace}
          slideAnim={detailSlideAnim}
          bottomInset={insets.bottom}
          onDismiss={handleDismissPlace}
          colors={DarkColors}
        />
      )}

      {/* ── Reveal overlay ─────────────────────────────────────────────────
          Last child so it covers everything above, including the search bar
          and any sheets. pointerEvents="none" is essential — without it the
          overlay swallows the first tap after every focus (invisible once
          faded, so this presents as "the map ignores my first tap"). */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background.primary, opacity: revealOpacity },
        ]}
      />
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
    borderColor: DarkColors.background.cardBorder,
  },
  searchBarAndroid: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DarkColors.background.cardBorder,
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
    maxHeight: BOTTOM_SHEET_MAX_HEIGHT,
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
  sheetHeading: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },

  enrichingBadge: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    borderRadius: 20,
    padding: Spacing['3'],
    zIndex: 20,
  },

  globeButton: {
    position: 'absolute',
    right: Spacing['5'],
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    // Above the results sheet: a peeked sheet whose height wasn't yet
    // measured, or one stranded by a bad clamp, must never cover this — it's
    // the only way out of a full-screen sheet besides typing.
    zIndex: 20,
  },

  // 44pt diameter deliberately matches the tapBbox hit area, so the pulse
  // shows the user exactly how forgiving the tap actually was.
  tapPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
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

  eyebrowWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
  },
});
