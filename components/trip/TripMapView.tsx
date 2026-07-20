import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  ShapeSource,
  CircleLayer,
  LineLayer,
} from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, MapPinLine, X } from 'phosphor-react-native';
import type * as GeoJSON from 'geojson';
import { DarkColors } from '@/constants/colors';
import { useFlyTo } from '@/hooks/useFlyTo';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { TripDay, TripActivity } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const INITIAL_ZOOM = 1.5;
const INITIAL_COORDS: [number, number] = [0, 20];

// Distinguishes each day's route line — separate from ACTIVITY_ICONS, which
// colors the pins by activity TYPE instead.
const DAY_ROUTE_COLORS = ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#c4b5fd', '#f9a8d4', '#93c5fd'];

interface GroundedStop {
  activity: TripActivity;
  dayId: string;
  dayNumber: number;
  dayColor: string;
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
    [...day.activities]
      .sort((a, b) => a.order - b.order)
      .forEach((activity) => {
        if (activity.placeId && activity.lat != null && activity.lng != null) {
          grounded.push({
            activity,
            dayId: day.id,
            dayNumber: day.dayNumber,
            dayColor,
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
  tripTitle: string;
  days: TripDay[];
  isOwner: boolean;
  /** Activity id currently being lazily resolved (from a "Locate" tap here or a timeline tap). */
  resolvingActivityId: string | null;
  /** Grounds one stop — same underlying logic as the timeline's tap-to-locate. */
  onLocateStop: (activity: TripActivity, dayId: string) => Promise<void>;
  /** An activity to fly straight to on open — set when arriving here via "show on map" from the timeline. */
  focusActivityId?: string | null;
  onBack: () => void;
}

export function TripMapView({
  tripTitle,
  days,
  isOwner,
  resolvingActivityId,
  onLocateStop,
  focusActivityId,
  onBack,
}: TripMapViewProps) {
  // Always-dark immersive screen (Architecture Rule 3) — the trip map is
  // atmosphere, not app chrome, so this hardcodes DarkColors rather than
  // following the (now light-by-default) theme.
  const colors = DarkColors;
  const insets = useSafeAreaInsets();
  const { cameraRef, flyTo, flyToBounds } = useFlyTo();
  const [selected, setSelected] = useState<GroundedStop | null>(null);
  const [locatingAll, setLocatingAll] = useState(false);

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
        },
      })),
    }),
    [grounded],
  );

  const routesCollection: GeoJSON.FeatureCollection = useMemo(() => {
    const byDay = new Map<string, GroundedStop[]>();
    grounded.forEach((stop) => {
      const list = byDay.get(stop.dayId) ?? [];
      list.push(stop);
      byDay.set(stop.dayId, list);
    });
    const features: GeoJSON.Feature[] = [];
    byDay.forEach((stops) => {
      if (stops.length < 2) return;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lng, s.lat]) },
        properties: { color: stops[0].dayColor },
      });
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

  const handlePinPress = useCallback(
    (event: { features: GeoJSON.Feature[] }) => {
      const activityId = event.features[0]?.properties?.activityId as string | undefined;
      const stop = grounded.find((s) => s.activity.id === activityId);
      if (!stop) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelected(stop);
      flyTo(stop.lng, stop.lat, 15.5);
    },
    [grounded, flyTo],
  );

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

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        projection="mercator"
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
          defaultSettings={{ centerCoordinate: INITIAL_COORDS, zoomLevel: INITIAL_ZOOM }}
          animationMode="none"
        />

        {/* Custom layers ON TOP of the Standard basemap — these are our own
            curated, already-resolved trip stops, never a filter/style change
            to Standard's own POI layers and never raw unresolved Google data. */}
        {routesCollection.features.length > 0 && (
          <ShapeSource id="trip-routes" shape={routesCollection}>
            <LineLayer
              id="trip-routes-line"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: 3,
                lineOpacity: 0.75,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {pointsCollection.features.length > 0 && (
          <ShapeSource id="trip-stops" shape={pointsCollection} onPress={handlePinPress}>
            <CircleLayer
              id="trip-stops-circle"
              style={{
                circleRadius: 9,
                circleColor: ['get', 'color'],
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
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
              : 'This trip has no stops yet.'}
          </Text>
        </View>
      )}

      {/* Selected stop card */}
      {selected && (
        <View
          style={[
            styles.selectedCard,
            { backgroundColor: colors.background.elevated, bottom: insets.bottom + (ungrounded.length > 0 && isOwner ? 96 : Spacing['4']) },
          ]}
        >
          <TypeIconBubble
            Icon={ACTIVITY_ICONS[selected.activity.type].Icon}
            color={ACTIVITY_ICONS[selected.activity.type].color}
            bubbleSize={36}
            iconSize={20}
          />
          <View style={styles.selectedTextBlock}>
            <Text style={[styles.selectedTitle, { color: colors.text.primary }]} numberOfLines={1}>
              {selected.activity.title}
            </Text>
            <Text style={[styles.selectedSubtitle, { color: colors.text.tertiary }]} numberOfLines={1}>
              Day {selected.dayNumber}{selected.activity.address ? ` · ${selected.activity.address}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
            <X size={16} color={colors.text.tertiary} weight="bold" />
          </TouchableOpacity>
        </View>
      )}

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
