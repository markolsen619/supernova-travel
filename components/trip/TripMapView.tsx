import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Dimensions } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  LineLayer,
} from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, MapPinLine, ListBullets, Notebook, X } from 'phosphor-react-native';
import type * as GeoJSON from 'geojson';
import { DarkColors } from '@/constants/colors';
import { useFlyTo } from '@/hooks/useFlyTo';
import { usePoiTapResolver } from '@/hooks/usePoiTapResolver';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { lightPresetForNow } from '@/services/mapLighting';
import { placeToTripActivity } from '@/services/places/googlePlaces';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { StopStateBubble } from '@/components/trip/StopStateBubble';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { DayPickerSheet } from '@/components/trip/DayPickerSheet';
import { SPRING } from '@/constants/motion';
import { TripDay, TripActivity } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const INITIAL_ZOOM = 1.5;
const INITIAL_COORDS: [number, number] = [0, 20];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
type ScreenPointPayload = { screenPointX: number; screenPointY: number };

// Distinguishes each day's route line — separate from ACTIVITY_ICONS, which
// colors the pins by activity TYPE instead.
const DAY_ROUTE_COLORS = ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#c4b5fd', '#f9a8d4', '#93c5fd'];

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

function collectStops(days: TripDay[]): { grounded: GroundedStop[]; ungrounded: UngroundedStop[] } {
  const grounded: GroundedStop[] = [];
  const ungrounded: UngroundedStop[] = [];
  days.forEach((day, dayIndex) => {
    const dayColor = DAY_ROUTE_COLORS[dayIndex % DAY_ROUTE_COLORS.length];
    let stopNumber = 0;
    [...day.activities]
      .sort((a, b) => a.order - b.order)
      .forEach((activity) => {
        if (activity.placeId && activity.lat != null && activity.lng != null) {
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
        } else if (!activity.placeId && activity.searchQuery) {
          ungrounded.push({ activity, dayId: day.id, dayNumber: day.dayNumber });
        }
      });
  });
  return { grounded, ungrounded };
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
}

export function TripMapView({
  tripId,
  tripTitle,
  days,
  isOwner,
  resolvingActivityId,
  onLocateStop,
  focusActivityId,
  onViewInTimeline,
  onToggleVisited,
  onOpenJournal,
  currentActivityId,
  onBack,
}: TripMapViewProps) {
  // Always-dark immersive screen (Architecture Rule 3) — the trip map is
  // atmosphere, not app chrome, so this hardcodes DarkColors rather than
  // following the (now light-by-default) theme.
  const colors = DarkColors;
  const insets = useSafeAreaInsets();
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
  const poiSlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const showPoiSheet = useCallback(() => {
    Animated.spring(poiSlideAnim, { toValue: 0, ...SPRING }).start();
  }, [poiSlideAnim]);

  const hidePoiSheet = useCallback(() => {
    Animated.spring(poiSlideAnim, { toValue: SCREEN_HEIGHT, ...SPRING }).start(() => setTappedPlace(null));
  }, [poiSlideAnim]);

  const { grounded, ungrounded } = useMemo(() => collectStops(days), [days]);

  const pointsCollection: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: grounded.map((stop) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
        properties: {
          activityId: stop.activity.id,
          color: ACTIVITY_ICONS[stop.activity.type].color,
          stopNumber: stop.stopNumber,
          visited: stop.visited,
          isCurrent: stop.activity.id === currentActivityId,
        },
      })),
    }),
    [grounded, currentActivityId],
  );

  // TM-2c: the signature "how far along" view — each day's path is broken
  // into per-segment pieces (not one polyline per day) so the line itself
  // can flip from traveled to upcoming exactly where the journey currently
  // stands. A segment counts as traveled only when BOTH its endpoints are
  // visited; touching even one not-yet-visited stop makes it upcoming. Still
  // a straight connector between consecutive stops — a real routed path
  // (roads, turn-by-turn) would need a directions-API call per day, a cost
  // decision this doesn't make.
  const routesCollection: GeoJSON.FeatureCollection = useMemo(() => {
    const byDay = new Map<string, GroundedStop[]>();
    grounded.forEach((stop) => {
      const list = byDay.get(stop.dayId) ?? [];
      list.push(stop);
      byDay.set(stop.dayId, list);
    });
    const features: GeoJSON.Feature[] = [];
    byDay.forEach((stops) => {
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
          properties: {
            color: a.dayColor,
            segmentType: a.visited && b.visited ? 'traveled' : 'upcoming',
          },
        });
      }
    });
    return { type: 'FeatureCollection', features };
  }, [grounded]);

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
      if (grounded.length === 1) {
        flyTo(grounded[0].lng, grounded[0].lat, 14);
        return;
      }
      const lats = grounded.map((s) => s.lat);
      const lngs = grounded.map((s) => s.lng);
      flyToBounds([Math.max(...lngs), Math.max(...lats)], [Math.min(...lngs), Math.min(...lats)]);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fit when the stop SET changes, not on every focus/fly helper identity change
    }, 300);
    return () => clearTimeout(timer);
  }, [grounded, focusActivityId]);

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
      const collection = await mapRef.current?.queryRenderedFeaturesAtPoint([screenPointX, screenPointY]);

      const nearbyOwnStop = await findOwnStopNearTap(screenPointX, screenPointY, collection);
      if (nearbyOwnStop) {
        selectOwnStop(nearbyOwnStop);
        return;
      }

      // Ambient Standard POI → resolve via Google, offer to add. Owner-only:
      // a non-owner can't write an activity anyway, so there's no reason to
      // spend a Places call resolving one for them.
      if (!isOwner) return;
      const resolved = await resolvePoiTap(mapRef, feature);
      if (!resolved) return;

      // Neither the exact-feature nor pixel-proximity check caught it, but
      // the place Google resolved to might STILL be one of the trip's
      // existing stops (its rendered label can sit further from our pin
      // than the threshold covers). This costs nothing extra — resolvePoiTap
      // already ran once, cache-first, same as any other tap — it's purely
      // a local identity check against stops already in memory, preferred
      // over pixel distance whenever it's available.
      const matchingStop = grounded.find((s) => s.activity.placeId === resolved.placeId);
      if (matchingStop) {
        selectOwnStop(matchingStop);
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
        const dayId = await addDay(tripId, { dayNumber: 1, date: null, title: '', notes: '' });
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
      for (const stop of ungrounded) {
        await onLocateStop(stop.activity, stop.dayId);
      }
    } finally {
      setLocatingAll(false);
    }
  }, [ungrounded, onLocateStop, locatingAll]);

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
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: INITIAL_COORDS, zoomLevel: INITIAL_ZOOM }}
          animationMode="none"
        />

        {/* Custom layers ON TOP of the Standard basemap — these are our own
            curated, already-resolved trip stops, never a filter/style change
            to Standard's own POI layers and never raw unresolved Google data. */}
        {routesCollection.features.length > 0 && (
          <ShapeSource id="trip-routes" shape={routesCollection}>
            {/* Traveled: solid, full-strength — the "how far along" line.
                Upcoming: dashed and lower-opacity, but the SAME day color
                (not a separate muted palette) so it's still legible over
                both a bright "day" preset and the dark "night" one — the
                dash pattern itself, not opacity alone, carries the "not yet"
                meaning. One LineLayer, data-driven on segmentType, so the
                boundary between the two never has to be manually tracked. */}
            <LineLayer
              id="trip-routes-line"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: ['case', ['==', ['get', 'segmentType'], 'traveled'], 3.5, 2.5],
                lineOpacity: ['case', ['==', ['get', 'segmentType'], 'traveled'], 0.9, 0.55],
                lineDasharray: ['case', ['==', ['get', 'segmentType'], 'traveled'], ['literal', [1, 0]], ['literal', [2, 2]]],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {pointsCollection.features.length > 0 && (
          <ShapeSource id="trip-stops" shape={pointsCollection}>
            {/* Three pin states (TM-2b): planned = hollow (colored stroke,
                transparent fill); current = hollow + a wider white ring —
                "next up"; visited = solid fill, matching the timeline row's
                filled treatment. */}
            <CircleLayer
              id="trip-stops-circle"
              style={{
                circleRadius: ['case', ['get', 'isCurrent'], 13, 11],
                circleColor: ['case', ['get', 'visited'], ['get', 'color'], 'rgba(0,0,0,0)'],
                circleStrokeWidth: ['case', ['get', 'isCurrent'], 3, ['get', 'visited'], 2, 2.5],
                circleStrokeColor: ['case', ['get', 'visited'], '#ffffff', ['get', 'isCurrent'], '#ffffff', ['get', 'color']],
              }}
            />
            {/* Order-within-day number, stacked on the circle — a dark halo
                keeps white text legible regardless of fill/stroke color or
                whether the pin is hollow (planned) or filled (visited). */}
            <SymbolLayer
              id="trip-stops-number"
              style={{
                textField: ['to-string', ['get', 'stopNumber']],
                textSize: 11,
                textColor: '#ffffff',
                textHaloColor: 'rgba(0,0,0,0.55)',
                textHaloWidth: 1,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtnCircle} hitSlop={8}>
          <ArrowLeft size={18} color="#ffffff" weight="bold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{tripTitle}</Text>
        <View style={styles.headerBtnCircle} />
      </View>

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

      {/* Ungrounded stops — on-demand locate only, never automatic */}
      {ungrounded.length > 0 && isOwner && (
        <View
          style={[styles.ungroundedPanel, { backgroundColor: colors.background.elevated, bottom: insets.bottom + Spacing['4'] }]}
        >
          <MapPinLine size={16} color={colors.text.tertiary} weight="bold" />
          <Text style={[styles.ungroundedText, { color: colors.text.secondary }]}>
            {ungrounded.length} stop{ungrounded.length === 1 ? '' : 's'} not yet located
          </Text>
          <TouchableOpacity
            onPress={handleLocateAll}
            disabled={locatingAll || !!resolvingActivityId}
            style={[styles.locateAllBtn, { backgroundColor: colors.brand.purple }]}
          >
            {locatingAll ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.locateAllBtnText}>
                Locate all ({ungrounded.length} search{ungrounded.length === 1 ? '' : 'es'})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
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
