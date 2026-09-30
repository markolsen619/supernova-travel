import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  ShapeSource,
  CircleLayer,
  LineLayer,
  MarkerView,
  RasterDemSource,
  Terrain,
  Atmosphere,
} from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, MapPinLine, ListBullets, Notebook, X, CaretLeft, CaretRight, Palette } from 'phosphor-react-native';
import type * as GeoJSON from 'geojson';
import { DarkColors } from '@/constants/colors';
import { useFlyTo } from '@/hooks/useFlyTo';
import { usePoiTapResolver } from '@/hooks/usePoiTapResolver';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useLayout } from '@/hooks/useLayout';
import { useDimensionChange } from '@/hooks/useDimensionChange';
import { tapBbox, findStopMatchingPlace } from '@/utils/mapInteraction';
import { lightPresetForNow } from '@/services/mapLighting';
import { placeToTripActivity } from '@/services/places/googlePlaces';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { StopStateBubble } from '@/components/trip/StopStateBubble';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { DayPickerSheet } from '@/components/trip/DayPickerSheet';
import { SPRING } from '@/constants/motion';
import { TripDay, TripActivity, TripStatus } from '@/types';
import { buildPath, markerStops, overviewDots, MARKER_MIN_ZOOM, type RouteStop } from '@/utils/tripRoutes';
import { useTripRoutes } from '@/hooks/useTripRoutes';
import { ROUTE_PALETTES, routePalette, dayRouteColor, type RoutePalette, type RoutePaletteId } from '@/constants/routePalettes';
import { useMapStyleStore } from '@/stores/useMapStyleStore';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const INITIAL_ZOOM = 1.5;
const INITIAL_COORDS: [number, number] = [0, 20];

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
type ScreenPointPayload = { screenPointX: number; screenPointY: number };


interface GroundedStop {
  activity: TripActivity;
  dayId: string;
  dayNumber: number;
  dayColor: string;
  /** 1-based position within its own day — what the pin's number shows. */
  stopNumber: number;
  visited: boolean;
  lat: number;
  lng: number;
}

interface UngroundedStop {
  activity: TripActivity;
  dayId: string;
  dayNumber: number;
}

// Each day's colour comes from the traveler's chosen palette (constants/routePalettes)
// — separate from ACTIVITY_ICONS, which colours marker icons by activity TYPE.
function collectStops(days: TripDay[], palette: RoutePalette): { grounded: GroundedStop[]; ungrounded: UngroundedStop[] } {
  const grounded: GroundedStop[] = [];
  const ungrounded: UngroundedStop[] = [];
  days.forEach((day, dayIndex) => {
    const dayColor = dayRouteColor(palette, dayIndex);
    let stopNumber = 0;
    [...day.activities]
      .sort((a, b) => a.order - b.order)
      .forEach((activity) => {
        // Grounded means "has coordinates", not "has a Google placeId". Mapbox-grounded
        // stops carry coordinates and no Google identity; they are pinnable now and
        // upgrade to a full Google place via enrichPoiByNameAndCoords only if the user
        // opens one. Gating on placeId here would hide every Mapbox-grounded pin.
        if (activity.lat != null && activity.lng != null) {
          stopNumber += 1;
          grounded.push({
            activity,
            dayId: day.id,
            dayNumber: day.dayNumber,
            dayColor,
            stopNumber,
            visited: activity.visited,
            lat: activity.lat,
            lng: activity.lng,
          });
        } else if (activity.searchQuery) {
          ungrounded.push({ activity, dayId: day.id, dayNumber: day.dayNumber });
        }
      });
  });
  return { grounded, ungrounded };
}

function toRouteStop(s: GroundedStop): RouteStop {
  return { id: s.activity.id, type: s.activity.type, title: s.activity.title, notes: s.activity.notes ?? '', lat: s.lat, lng: s.lng };
}

interface TripMapViewProps {
  tripId: string;
  tripTitle: string;
  days: TripDay[];
  isOwner: boolean;
  /** Activity id currently being lazily resolved (from a "Locate" tap here or a timeline tap). */
  resolvingActivityId: string | null;
  /** Grounds one stop — same underlying logic as the timeline's tap-to-locate. */
  onLocateStop: (activity: TripActivity, dayId: string) => Promise<void>;
  /** Activities whose grounding search already came back empty this session
   * — "Locate all" skips these rather than re-billing a search it already
   * knows will fail. */
  unresolvedActivityIds?: Set<string>;
  /** An activity to fly straight to on open — set when arriving here via "show on map" from the timeline. */
  focusActivityId?: string | null;
  /** Switches back to the timeline, scrolled to and highlighting this activity. */
  onViewInTimeline?: (activityId: string) => void;
  /** Manual visited toggle (TM-2b) — omit for viewers. */
  onToggleVisited?: (activity: TripActivity, dayId: string) => void;
  /** Opens the journal ("your visit") for a visited stop (TM-3c). */
  onOpenJournal?: (activity: TripActivity, dayId: string) => void;
  /** The trip's next not-yet-visited stop, in day/order sequence — "you are here". */
  currentActivityId?: string | null;
  onBack: () => void;
  /** Owner or collaborator — only they fetch and cache missing routes. */
  canEditRoutes: boolean;
  tripStatus: TripStatus;
  tripEndDate: Date | null;
}

export function TripMapView({
  tripId,
  tripTitle,
  days,
  isOwner,
  resolvingActivityId,
  onLocateStop,
  unresolvedActivityIds,
  focusActivityId,
  onViewInTimeline,
  onToggleVisited,
  onOpenJournal,
  currentActivityId,
  onBack,
  canEditRoutes,
}: TripMapViewProps) {
  // Always-dark immersive screen (Architecture Rule 3) — the trip map is
  // atmosphere, not app chrome, so this hardcodes DarkColors rather than
  // following the (now light-by-default) theme.
  const colors = DarkColors;
  const insets = useSafeAreaInsets();
  const { height } = useLayout();
  const { cameraRef, flyTo, flyToBounds } = useFlyTo();
  const mapRef = useRef<InstanceType<typeof MapView>>(null);
  const [selected, setSelected] = useState<GroundedStop | null>(null);
  const [locatingAll, setLocatingAll] = useState(false);

  // ── Add-from-map (TM-1a) ────────────────────────────────────────────────
  const { addDay, addActivity } = useCreateTrip();
  const { enriching: resolvingPoi, resolvePoiTap } = usePoiTapResolver();
  const [tappedPlace, setTappedPlace] = useState<EnrichedPlace | null>(null);
  const [adding, setAdding] = useState(false);
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<EnrichedPlace | null>(null);
  const poiSlideAnim = useRef(new Animated.Value(height)).current;

  const showPoiSheet = useCallback(() => {
    Animated.spring(poiSlideAnim, { toValue: 0, ...SPRING }).start();
  }, [poiSlideAnim]);

  const hidePoiSheet = useCallback(() => {
    Animated.spring(poiSlideAnim, { toValue: height, ...SPRING }).start(() => setTappedPlace(null));
  }, [poiSlideAnim, height]);

  // One resize handler for the whole screen: re-seed the closed POI sheet's
  // offscreen position (only while closed — re-seeding an open sheet would
  // yank it out of view under the user) AND refit the camera to the trip's
  // stops, since a changed viewport means the old camera framing (set by the
  // effect below, or by a PREVIOUS resize) no longer frames the itinerary.
  // fitAllStops no-ops when there's nothing grounded yet, so this is safe
  // even before any stop has been located.
  useDimensionChange((next) => {
    if (!tappedPlace) poiSlideAnim.setValue(next.height);
    fitAllStops();
  });

  const paletteId = useMapStyleStore((st) => st.paletteId);
  const setPaletteId = useMapStyleStore((st) => st.setPaletteId);
  const palette = routePalette(paletteId);
  const { grounded, ungrounded } = useMemo(() => collectStops(days, palette), [days, palette]);

  // Route-colour picker: a row of swatches under the header.
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerAnim = useRef(new Animated.Value(0)).current;
  const togglePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !pickerOpen;
    setPickerOpen(next);
    // Springs in on open; closing unmounts the row, so no exit animation.
    if (next) {
      pickerAnim.setValue(0);
      Animated.spring(pickerAnim, { toValue: 1, ...SPRING }).start();
    }
  }, [pickerOpen, pickerAnim]);
  const choosePalette = useCallback((id: RoutePaletteId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPaletteId(id);
  }, [setPaletteId]);
  // Split what "Locate all" can still usefully try from what already came
  // back empty this session — the banner acts on the former and quietly
  // informs on the latter, instead of one count that looks stuck forever.
  const pendingUngrounded = useMemo(
    () => ungrounded.filter((u) => !unresolvedActivityIds?.has(u.activity.id)),
    [ungrounded, unresolvedActivityIds],
  );
  const failedUngrounded = ungrounded.length - pendingUngrounded.length;

  const pointsCollection: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: grounded.map((stop) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
        properties: {
          activityId: stop.activity.id,
          color: stop.dayColor,
          stopNumber: stop.stopNumber,
          visited: stop.visited,
          isCurrent: stop.activity.id === currentActivityId,
        },
      })),
    }),
    [grounded, currentActivityId],
  );

  // Each day's stops as one routed path. Legs follow real roads/footpaths
  // once cached (hooks/useTripRoutes → Mapbox Directions, fetched once per
  // leg, ever); until then, and for flights/ferries, they're smooth arcs.
  const stopsByDay = useMemo(() => {
    const byDay = new Map<string, GroundedStop[]>();
    grounded.forEach((s) => byDay.set(s.dayId, [...(byDay.get(s.dayId) ?? []), s]));
    return [...byDay.entries()];
  }, [grounded]);

  // Built once against an empty cache only to learn which legs are missing.
  const allMissing = useMemo(
    () => stopsByDay.flatMap(([, stops]) => buildPath(stops.map(toRouteStop), {}).missing),
    [stopsByDay],
  );
  const { cache } = useTripRoutes(tripId, allMissing, canEditRoutes);

  const dayPaths = useMemo(
    () => stopsByDay.map(([dayId, stops]) => ({
      dayId,
      color: stops[0].dayColor,
      stops,
      path: buildPath(stops.map(toRouteStop), cache),
    })),
    [stopsByDay, cache],
  );

  const routesCollection: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: dayPaths
      .map((d, dayIndex) => ({ d, dayIndex }))
      .filter(({ d }) => d.path.coordinates.length > 1)
      .map(({ d, dayIndex }) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: d.path.coordinates },
        properties: { dayId: d.dayId, dayIndex, color: d.color },
      })),
  }), [dayPaths]);

  // Markers are native views — only worth their cost close in. Tracked as a
  // boolean flipped at the threshold, not the live zoom, so a pinch doesn't
  // re-render the map every frame.
  const [closeIn, setCloseIn] = useState(false);
  const handleCameraChanged = useCallback((state: { properties: { zoom: number } }) => {
    const next = state.properties.zoom >= MARKER_MIN_ZOOM;
    setCloseIn((prev) => (prev === next ? prev : next));
  }, []);
  const visibleMarkers = markerStops(closeIn ? MARKER_MIN_ZOOM : 0, grounded, selected?.dayId ?? null);
  const visibleDots = overviewDots(closeIn, grounded);

  // Fits the camera to whatever's grounded — a single stop gets the same
  // deliberate zoom-14 framing used everywhere else for one place (a bounds
  // box collapses to ne === sw for one point, which Mapbox resolves to a
  // near-max zoom, not this); two or more get a bounding-box fit. Shared by
  // the on-open effect below and the resize handler above (a changed
  // viewport means the old camera no longer frames the trip). No-ops with
  // nothing grounded, so callers don't need their own length check.
  const fitAllStops = useCallback(() => {
    if (grounded.length === 0) return;
    if (grounded.length === 1) {
      flyTo(grounded[0].lng, grounded[0].lat, 14);
      return;
    }
    const lats = grounded.map((s) => s.lat);
    const lngs = grounded.map((s) => s.lng);
    flyToBounds([Math.max(...lngs), Math.max(...lats)], [Math.min(...lngs), Math.min(...lats)]);
  }, [grounded, flyTo, flyToBounds]);

  // Fit the camera to all grounded stops on open — or fly straight to a
  // specific one if we arrived here via "show on map" from the timeline.
  useEffect(() => {
    if (grounded.length === 0) return;
    const timer = setTimeout(() => {
      if (focusActivityId) {
        const focused = grounded.find((s) => s.activity.id === focusActivityId);
        if (focused) {
          flyTo(focused.lng, focused.lat, 15.5);
          setSelected(focused);
          return;
        }
      }
      fitAllStops();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fit when the stop SET changes, not on every focus/fly helper identity change
    }, 300);
    return () => clearTimeout(timer);
  }, [grounded, focusActivityId]);

  // Day-cycling (arriving at a stop via "show on map" or a pin tap should
  // let you step through the REST of that day without leaving the map) —
  // derived fresh from the selected stop's own dayId + grounded's existing
  // stopNumber order, not separately tracked state.
  const dayStops = useMemo(() => {
    if (!selected) return [];
    return grounded
      .filter((s) => s.dayId === selected.dayId)
      .sort((a, b) => a.stopNumber - b.stopNumber);
  }, [grounded, selected]);
  const dayStopIndex = selected ? dayStops.findIndex((s) => s.activity.id === selected.activity.id) : -1;

  const goToDayStop = useCallback(
    (index: number) => {
      const stop = dayStops[index];
      if (!stop) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      flyTo(stop.lng, stop.lat, 15.5);
      setSelected(stop);
    },
    [dayStops, flyTo],
  );

  // A trip stop and an ambient Standard POI can occupy the same spot on
  // screen — Standard's own POI label for a place we've already added
  // doesn't disappear just because we drew our own pin on top of it. Near a
  // known stop, the trip's stop must win: the same real place should never
  // render as two different cards. "Near" is decided two ways, cheapest
  // first:
  const OWN_PIN_PROXIMITY_PX = 28; // pin circleRadius(11) * 2 + finger/label slop

  const findOwnStopNearTap = useCallback(
    async (
      screenPointX: number,
      screenPointY: number,
      collection: GeoJSON.FeatureCollection | undefined,
    ): Promise<GroundedStop | undefined> => {
      // 1. Exact hit — the tap landed directly on our own circle/number
      //    feature (only our features carry `activityId`).
      const ownFeature = collection?.features?.find((f) => f.properties?.activityId);
      if (ownFeature) {
        return grounded.find((s) => s.activity.id === (ownFeature.properties?.activityId as string));
      }
      if (grounded.length === 0 || !mapRef.current) return undefined;

      // 2. Near miss — project every stop to its current screen position
      //    (no network call, just the map's own coordinate transform) and
      //    check Euclidean pixel distance. Catches a slightly-off tap, or
      //    Standard rendering its own POI label a few px from where we
      //    placed the pin.
      const projected = await Promise.all(
        grounded.map(async (stop) => ({
          stop,
          point: await mapRef.current!.getPointInView([stop.lng, stop.lat]),
        })),
      );
      let closest: { stop: GroundedStop; distance: number } | null = null;
      for (const { stop, point } of projected) {
        const dx = point[0] - screenPointX;
        const dy = point[1] - screenPointY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (!closest || distance < closest.distance) closest = { stop, distance };
      }
      return closest && closest.distance <= OWN_PIN_PROXIMITY_PX ? closest.stop : undefined;
    },
    [grounded],
  );

  const selectOwnStop = useCallback(
    (stop: GroundedStop) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelected(stop);
      setTappedPlace(null);
      flyTo(stop.lng, stop.lat, 15.5);
    },
    [flyTo],
  );

  // Single unified tap handler for the whole map: query whatever's rendered
  // at the tap point and decide what it is. Deliberately ONE handler (not a
  // ShapeSource-level onPress for our pins PLUS a separate MapView-level
  // onPress for ambient POIs) — with two competing handlers, the same tap
  // could fire both, double-handling it.
  const handleMapPress = useCallback(
    async (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => {
      const { screenPointX, screenPointY } = feature.properties;
      // Same 44pt rect usePoiTapResolver queries (tapBbox) — not a bare
      // point. A near-miss 28-44pt from a trip stop used to fail this exact
      // -hit check on the tighter point query, fall through to the ambient
      // POI path below, and spend a billed Text Search whose result the
      // matchingStop check further down would just discard anyway.
      const collection = await mapRef.current?.queryRenderedFeaturesInRect(
        tapBbox(screenPointX, screenPointY),
      );

      const nearbyOwnStop = await findOwnStopNearTap(screenPointX, screenPointY, collection);
      if (nearbyOwnStop) {
        selectOwnStop(nearbyOwnStop);
        return;
      }

      // Ambient Standard POI → resolve via Google, offer to add. Owner-only:
      // a non-owner can't write an activity anyway, so there's no reason to
      // spend a Places call resolving one for them.
      if (!isOwner) return;
      // resolvePoiTap can reject: Google Text Search throws on a network
      // failure and (deliberately) on any non-2xx, so a rate limit or a
      // provider outage arrives here as an exception. Swallow it into the
      // same dead-end a miss produces rather than letting it escape as an
      // unhandled rejection out of MapView's onPress.
      let resolved: EnrichedPlace | null = null;
      try {
        resolved = await resolvePoiTap(mapRef, feature);
      } catch (err) {
        console.error('[TripMapView] POI resolution failed:', err);
        return;
      }
      if (!resolved) return;

      // Neither the exact-feature nor pixel-proximity check caught it, but
      // the place Google resolved to might STILL be one of the trip's
      // existing stops (its rendered label can sit further from our pin
      // than the threshold covers). This costs nothing extra — resolvePoiTap
      // already ran once, cache-first, same as any other tap — it's purely
      // a local check against stops already in memory. Not a bare placeId
      // comparison: most stops are Mapbox-grounded and carry no placeId, so
      // identity alone would miss the majority case and offer "Add to trip"
      // for a stop the trip already has. See findStopMatchingPlace.
      const matched = findStopMatchingPlace(
        grounded.map((s) => ({ placeId: s.activity.placeId, lat: s.lat, lng: s.lng, stop: s })),
        resolved,
      );
      if (matched) {
        selectOwnStop(matched.stop);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelected(null);
      setTappedPlace(resolved);
      showPoiSheet();
    },
    [grounded, findOwnStopNearTap, selectOwnStop, isOwner, resolvePoiTap, showPoiSheet],
  );

  const writeActivity = useCallback(
    async (place: EnrichedPlace, dayId: string) => {
      setAdding(true);
      try {
        await addActivity(tripId, dayId, placeToTripActivity(place));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (err) {
        console.error('[TripMapView] add from map failed:', err);
      } finally {
        setAdding(false);
      }
    },
    [tripId, addActivity],
  );

  const handleAddToTripFromMap = useCallback(
    async (place: EnrichedPlace) => {
      if (adding) return;
      if (days.length === 0) {
        // First day of the trip always starts at the first (primary) destination.
        const dayId = await addDay(tripId, { dayNumber: 1, destinationIndex: 0, date: null, title: '', notes: '' });
        await writeActivity(place, dayId);
        hidePoiSheet();
        return;
      }
      if (days.length === 1) {
        await writeActivity(place, days[0].id);
        hidePoiSheet();
        return;
      }
      // Multiple days — the map shows the whole trip at once, so unlike
      // AddStopSheet (scoped to one day already) we need to ask.
      setPendingPlace(place);
      setDayPickerVisible(true);
    },
    [adding, days, tripId, addDay, writeActivity, hidePoiSheet],
  );

  const handleDayPicked = useCallback(
    async (dayId: string) => {
      if (!pendingPlace) return;
      await writeActivity(pendingPlace, dayId);
      setDayPickerVisible(false);
      setPendingPlace(null);
      hidePoiSheet();
    },
    [pendingPlace, writeActivity, hidePoiSheet],
  );

  const handleCloseDayPicker = useCallback(() => {
    setDayPickerVisible(false);
    setPendingPlace(null);
  }, []);

  const handleLocateAll = useCallback(async () => {
    if (locatingAll) return;
    setLocatingAll(true);
    try {
      // Sequential, not parallel — this is an explicit bulk action the user
      // opted into, but there's no reason to burst N Text Searches at once.
      for (const stop of pendingUngrounded) {
        await onLocateStop(stop.activity, stop.dayId);
      }
    } finally {
      setLocatingAll(false);
    }
  }, [pendingUngrounded, onLocateStop, locatingAll]);

  const handleViewInTimeline = useCallback(() => {
    if (!selected || !onViewInTimeline) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onViewInTimeline(selected.activity.id);
  }, [selected, onViewInTimeline]);

  const handleOpenJournal = useCallback(() => {
    if (!selected || !onOpenJournal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenJournal(selected.activity, selected.dayId);
  }, [selected, onOpenJournal]);

  const handleToggleSelectedVisited = onToggleVisited && selected
    ? () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggleVisited(selected.activity, selected.dayId);
      }
    : undefined;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        projection="mercator"
        onPress={handleMapPress}
        onCameraChanged={handleCameraChanged}
        // Mapbox ToS requires the wordmark + attribution on-map
        logoEnabled
        logoPosition={{ bottom: 24, left: 8 }}
        attributionEnabled
        attributionPosition={{ bottom: 24, right: 8 }}
        compassEnabled={false}
        scaleBarEnabled={false}
      >
        <StyleImport
          id="basemap"
          existing
          config={{
            // Real time-of-day lighting — computed at mount; a trip map view
            // is short-lived enough that it doesn't need live updates.
            lightPreset: lightPresetForNow(),
            showPointOfInterestLabels: true,
            showLandmarkIcons: true,
            show3dBuildings: true,
          }}
        />
        {/* 3D terrain and sky — part of the map load already paid for, so the
            immersion costs nothing extra. */}
        <RasterDemSource id="terrain-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={514} maxZoomLevel={14}>
          <Terrain style={{ exaggeration: 1.3 }} />
        </RasterDemSource>
        <Atmosphere style={{ range: [0.8, 8], horizonBlend: 0.12, starIntensity: 0.12 }} />
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: INITIAL_COORDS, zoomLevel: INITIAL_ZOOM }}
          animationMode="none"
        />

        {/* Custom layers ON TOP of the Standard basemap — these are our own
            curated, already-resolved trip stops, never a filter/style change
            to Standard's own POI layers and never raw unresolved Google data. */}
        {routesCollection.features.length > 0 && (
          <ShapeSource id="trip-routes" shape={routesCollection} lineMetrics>
            {/* A soft wide casing under a crisp line reads as a glowing route
                on both the day and night presets and over terrain. Emissive
                strength 1 keeps Standard's dusk/night lighting from shading
                our own layers near-black. */}
            <LineLayer
              id="trip-routes-casing"
              style={{ lineColor: ['get', 'color'], lineWidth: 9, lineOpacity: 0.22, lineBlur: 4, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1, lineOcclusionOpacity: 0.6 }}
            />
            <LineLayer
              id="trip-routes-line"
              aboveLayerID="trip-routes-casing"
              style={{ lineColor: ['get', 'color'], lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 3, 16, 6], lineOpacity: 0.95, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1, lineOcclusionOpacity: 0.6 }}
            />
          </ShapeSource>
        )}

        {pointsCollection.features.length > 0 && (
          <ShapeSource id="trip-stops" shape={pointsCollection}>
            {/* Fallback dots for trips past MARKER_MAX_COUNT stops, and the
                features tap handling finds by activityId. Smaller trips draw
                their overview dots as native views below (overviewDots). */}
            <CircleLayer
              id="trip-stops-circle"
              maxZoomLevel={MARKER_MIN_ZOOM}
              style={{
                circleRadius: 6,
                circleColor: ['get', 'color'],
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
                circleEmissiveStrength: 1,
              }}
            />
          </ShapeSource>
        )}

        {visibleDots.map((stop) => (
          <MarkerView key={`dot-${stop.activity.id}`} coordinate={[stop.lng, stop.lat]} allowOverlap>
            <TouchableOpacity
              onPress={() => selectOwnStop(stop)}
              hitSlop={14}
              accessibilityLabel={`Stop ${stop.stopNumber}: ${stop.activity.title}`}
              style={[styles.dot, { backgroundColor: stop.dayColor }, stop.visited && styles.dotVisited]}
            />
          </MarkerView>
        ))}

        {visibleMarkers.map((stop) => {
          const { Icon, color } = ACTIVITY_ICONS[stop.activity.type];
          return (
            <MarkerView key={stop.activity.id} coordinate={[stop.lng, stop.lat]} allowOverlap>
              <TouchableOpacity
                onPress={() => selectOwnStop(stop)}
                accessibilityLabel={`Stop ${stop.stopNumber}: ${stop.activity.title}`}
                style={[styles.marker, { borderColor: stop.dayColor, backgroundColor: colors.background.elevated }]}
              >
                <StopStateBubble
                  Icon={Icon}
                  color={color}
                  visited={stop.visited}
                  isCurrent={stop.activity.id === currentActivityId}
                  bubbleSize={32}
                  iconSize={18}
                  surfaceColor={colors.background.elevated}
                />
                <View style={[styles.markerBadge, { backgroundColor: stop.dayColor }]}>
                  <Text style={styles.markerBadgeText}>{stop.stopNumber}</Text>
                </View>
              </TouchableOpacity>
            </MarkerView>
          );
        })}
      </MapView>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtnCircle} hitSlop={8}>
          <ArrowLeft size={18} color="#ffffff" weight="bold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tripTitle}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={togglePicker}
            style={styles.headerBtnCircle}
            hitSlop={8}
            accessibilityLabel="Route colours"
            accessibilityState={{ expanded: pickerOpen }}
          >
            <Palette size={18} color="#ffffff" weight={pickerOpen ? 'fill' : 'bold'} />
          </TouchableOpacity>
        </View>
      </View>

      {pickerOpen ? (
        <Animated.View
          style={[
            styles.palettePicker,
            { top: insets.top + 56, backgroundColor: colors.background.elevated },
            { opacity: pickerAnim, transform: [{ translateY: pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] },
          ]}
        >
          {ROUTE_PALETTES.map((p) => {
            const chosen = p.id === palette.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => choosePalette(p.id)}
                style={styles.paletteOption}
                accessibilityRole="button"
                accessibilityLabel={`${p.label} route colours`}
                accessibilityState={{ selected: chosen }}
              >
                <View style={[styles.swatch, chosen && styles.swatchChosen]}>
                  {p.days.slice(0, 3).map((c) => (
                    <View key={c} style={[styles.swatchSegment, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={[styles.paletteLabel, { color: chosen ? colors.text.primary : colors.text.secondary }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      ) : null}

      {/* Nothing located yet */}
      {grounded.length === 0 && (
        <View style={[styles.emptyOverlay, { top: insets.top + 80 }]}>
          <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
            {ungrounded.length > 0
              ? 'No stops located yet — locate them below to see them here.'
              : isOwner
                ? 'Tap a place on the map to add your first stop.'
                : 'This trip has no stops yet.'}
          </Text>
        </View>
      )}

      {/* Resolving an ambient POI tap */}
      {resolvingPoi && (
        <View style={[styles.enrichingBadge, { backgroundColor: 'rgba(11,10,18,0.85)' }]}>
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}

      {/* Selected stop card — one of OUR OWN pins */}
      {selected && (
        <View
          style={[
            styles.selectedCard,
            { backgroundColor: colors.background.elevated, bottom: insets.bottom + (ungrounded.length > 0 && isOwner ? 96 : Spacing['4']) },
          ]}
        >
          {/* Day-cycling — only surfaces once there's something to cycle
              through, so a single-stop day looks exactly as it did before. */}
          {dayStops.length > 1 && (
            <View style={[styles.dayNavRow, { borderBottomColor: colors.background.cardBorder }]}>
              <TouchableOpacity
                onPress={() => goToDayStop(dayStopIndex - 1)}
                disabled={dayStopIndex <= 0}
                hitSlop={8}
                accessibilityLabel="Previous stop today"
              >
                <CaretLeft size={16} color={dayStopIndex <= 0 ? colors.text.disabled : colors.text.secondary} weight="bold" />
              </TouchableOpacity>
              <Text style={[styles.dayNavText, { color: colors.text.tertiary }]}>
                Stop {dayStopIndex + 1} of {dayStops.length} today
              </Text>
              <TouchableOpacity
                onPress={() => goToDayStop(dayStopIndex + 1)}
                disabled={dayStopIndex >= dayStops.length - 1}
                hitSlop={8}
                accessibilityLabel="Next stop today"
              >
                <CaretRight
                  size={16}
                  color={dayStopIndex >= dayStops.length - 1 ? colors.text.disabled : colors.text.secondary}
                  weight="bold"
                />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.selectedCardRow}>
            <StopStateBubble
              Icon={ACTIVITY_ICONS[selected.activity.type].Icon}
              color={ACTIVITY_ICONS[selected.activity.type].color}
              visited={selected.activity.visited}
              isCurrent={selected.activity.id === currentActivityId}
              onToggle={handleToggleSelectedVisited}
              surfaceColor={colors.background.elevated}
            />
            <View style={styles.selectedTextBlock}>
              <Text style={[styles.selectedTitle, { color: colors.text.primary }]} numberOfLines={1}>
                {selected.activity.title}
              </Text>
              <Text style={[styles.selectedSubtitle, { color: colors.text.tertiary }]} numberOfLines={1}>
                Day {selected.dayNumber} · Stop {selected.stopNumber}
                {selected.activity.visited ? ' · Visited' : ''}
                {selected.activity.address ? ` · ${selected.activity.address}` : ''}
              </Text>
            </View>
            {/* Journal only applies to a VISITED stop — per TM-3b, a planned
                stop has nothing to journal yet. */}
            {onOpenJournal && selected.activity.visited ? (
              <TouchableOpacity onPress={handleOpenJournal} hitSlop={8} style={styles.viewInTimelineBtn} accessibilityLabel="View journal">
                <Notebook size={18} color={colors.brand.purple} weight="bold" />
              </TouchableOpacity>
            ) : null}
            {onViewInTimeline ? (
              <TouchableOpacity onPress={handleViewInTimeline} hitSlop={8} style={styles.viewInTimelineBtn} accessibilityLabel="View in timeline">
                <ListBullets size={18} color={colors.brand.purple} weight="bold" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
              <X size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Newly-tapped ambient POI — Google detail card, "Add to trip" */}
      {tappedPlace && (
        <PlaceDetailSheet
          place={tappedPlace}
          slideAnim={poiSlideAnim}
          bottomInset={insets.bottom}
          onDismiss={hidePoiSheet}
          onAddToTrip={handleAddToTripFromMap}
          addToTripLabel={adding ? 'Adding…' : 'Add to trip'}
          colors={colors}
        />
      )}

      <DayPickerSheet
        visible={dayPickerVisible}
        days={days}
        onSelect={handleDayPicked}
        onClose={handleCloseDayPicker}
        colors={colors}
      />

      {/* Ungrounded stops — on-demand locate only, never automatic. Two
          states: stops we haven't tried yet (actionable) vs. stops that
          already came back with no match this session (informational only —
          re-pressing "Locate all" would just silently fail again, which is
          what previously made this banner feel stuck). */}
      {pendingUngrounded.length > 0 && isOwner && (
        <View
          style={[styles.ungroundedPanel, { backgroundColor: colors.background.elevated, bottom: insets.bottom + Spacing['4'] }]}
        >
          <MapPinLine size={16} color={colors.text.tertiary} weight="bold" />
          <Text style={[styles.ungroundedText, { color: colors.text.secondary }]}>
            {pendingUngrounded.length} stop{pendingUngrounded.length === 1 ? " isn't" : "s aren't"} on the map yet
          </Text>
          <TouchableOpacity
            onPress={handleLocateAll}
            disabled={locatingAll || !!resolvingActivityId}
            style={[styles.locateAllBtn, { backgroundColor: colors.brand.purple }]}
          >
            {locatingAll ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.locateAllBtnText}>Locate all</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {pendingUngrounded.length === 0 && failedUngrounded > 0 && isOwner && (
        <View
          style={[styles.ungroundedPanel, { backgroundColor: colors.background.elevated, bottom: insets.bottom + Spacing['4'] }]}
        >
          <MapPinLine size={16} color={colors.text.disabled} weight="bold" />
          <Text style={[styles.ungroundedText, { color: colors.text.tertiary }]}>
            {failedUngrounded} stop{failedUngrounded === 1 ? '' : 's'} couldn&apos;t be matched to a place — edit
            {failedUngrounded === 1 ? ' it' : ' them'} from the day&apos;s list to fix the name
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A solid disc with a day-coloured ring — a bare bubble disappeared
  // against dark 3D buildings.
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderRadius: 24,
    borderWidth: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dotVisited: { width: 16, height: 16, borderRadius: 8 },
  markerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  markerBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: FontWeight.bold },
  container: { flex: 1, backgroundColor: DarkColors.background.primary },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  headerRight: { flexDirection: 'row', gap: Spacing['2'] },
  palettePicker: {
    position: 'absolute',
    left: Spacing['4'],
    right: Spacing['4'],
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3'],
  },
  paletteOption: { alignItems: 'center', minWidth: 52, minHeight: 44, gap: 6 },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchChosen: { borderColor: '#ffffff' },
  swatchSegment: { flex: 1 },
  paletteLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  headerBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Spacing['3'],
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  emptyOverlay: {
    position: 'absolute',
    left: Spacing['8'],
    right: Spacing['8'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },

  enrichingBadge: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    borderRadius: 20,
    padding: Spacing['3'],
    zIndex: 20,
  },

  selectedCard: {
    position: 'absolute',
    left: Spacing['4'],
    right: Spacing['4'],
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
  },
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    paddingBottom: Spacing['2'],
    marginBottom: Spacing['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayNavText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  selectedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  selectedTextBlock: { flex: 1 },
  selectedTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  selectedSubtitle: { fontSize: FontSize.xs, marginTop: 2 },
  viewInTimelineBtn: { padding: Spacing['1'] },

  ungroundedPanel: {
    position: 'absolute',
    left: Spacing['4'],
    right: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
  },
  ungroundedText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  locateAllBtn: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  locateAllBtnText: {
    color: '#ffffff',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
