import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  RasterDemSource,
  Terrain,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  HeatmapLayer,
  MarkerView,
  setAccessToken,
  type MapState,
} from '@rnmapbox/maps';
import type { CameraHandle } from '@/hooks/useFlyTo';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import { destinationPinFeatures } from '@/utils/heatmap';
import type { Destination } from '@/utils/destinations';
import type { LightPreset } from '@/services/mapLighting';
import { basemapConfig } from '@/utils/mapLook';
import { DarkColors } from '@/constants/colors';
import { FriendStackMarker, FriendTravelMarker } from '@/components/search/FriendTravelMarker';
import type { FriendTraveling } from '@/hooks/useFriendsTraveling';
import { friendStacks, type FriendStack } from '@/utils/friendsTraveling';
import type * as GeoJSON from 'geojson';

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
export type ScreenPointPayload = { screenPointX: number; screenPointY: number };

// Set token once at module load — before any MapView renders
setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

// Initial camera: wide-angle globe view centred on 0°N 20°W
export const INITIAL_ZOOM = 1.5;
export const INITIAL_COORDS: [number, number] = [0, 20]; // [lng, lat]


/**
 * Destination pins stop drawing here; Standard's own POI labels arrive around
 * z14 on their own. A hard cutoff rather than an interpolated opacity
 * crossfade: one prop, enforced by the native SDK, so it behaves identically
 * on iOS and Android with no per-platform tuning.
 */
const TRENDING_MAX_ZOOM = 12;

interface GlobeMapViewProps {
  cameraRef: React.RefObject<CameraHandle | null>;
  mapRef: React.RefObject<InstanceType<typeof MapView> | null>;
  lightPreset: LightPreset;
  onPress: (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => void;
  onCameraChanged?: (zoom: number) => void;
  /** Catalog destinations — one pin each at its centre, sized by popularity. */
  destinations?: Destination[];
  /** aggregates/heatmap as points (useHeatmap); null draws no heat layer. */
  heat?: GeoJSON.FeatureCollection | null;
  selectedPlace?: EnrichedPlace | null;
  /** People you follow on a trip today, at that day's city (useFriendsTraveling). */
  friends?: FriendTraveling[];
  /** Whole-number zoom, for spreading friends who share a city. */
  zoomBucket?: number;
  onFriendPress?: (friend: FriendTraveling) => void;
  /** A stack of friends at world view was tapped (fly in until they separate). */
  onFriendStackPress?: (stack: FriendStack<FriendTraveling>) => void;
  /** The clustered catalog source, so a bubble tap can ask where it splits. */
  destinationSourceRef?: React.RefObject<ShapeSource | null>;
}

export function GlobeMapView({
  cameraRef,
  mapRef,
  lightPreset,
  onPress,
  onCameraChanged,
  destinations,
  heat,
  selectedPlace,
  friends,
  zoomBucket = 2,
  onFriendPress,
  onFriendStackPress,
  destinationSourceRef,
}: GlobeMapViewProps) {
  // Friends at any distance (spec 2026-11-11): stacked at world view, spread around shared cities closer in.
  const friendLayout = useMemo(() => friendStacks(friends ?? [], zoomBucket), [friends, zoomBucket]);
  const handleFriendPress = React.useCallback((f: FriendTraveling) => onFriendPress?.(f), [onFriendPress]);
  const handleStackPress = React.useCallback((s: FriendStack<FriendTraveling>) => onFriendStackPress?.(s), [onFriendStackPress]);

  const handleMapLoadingError = React.useCallback(() => {
    console.error('[SearchMap] Mapbox Standard style failed to load — check EXPO_PUBLIC_MAPBOX_TOKEN and network.');
  }, []);

  // Named distinctly from search.tsx's own handleCameraChanged — this one is
  // just the zoom-extraction bridge to that consumer's handler.
  const handleMapCameraChanged = React.useCallback(
    (state: MapState) => onCameraChanged?.(state.properties.zoom),
    [onCameraChanged],
  );

  const destinationCollection = useMemo<GeoJSON.FeatureCollection>(
    () => destinationPinFeatures(destinations ?? []),
    [destinations],
  );

  const selectedCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: selectedPlace
        ? [
            {
              type: 'Feature' as const,
              id: selectedPlace.placeId,
              properties: { name: selectedPlace.name },
              geometry: {
                type: 'Point' as const,
                coordinates: [selectedPlace.lng, selectedPlace.lat],
              },
            },
          ]
        : [],
    }),
    [selectedPlace],
  );

  // Sent only when the light changes, not on every render.
  const globeConfig = useMemo(() => basemapConfig(lightPreset, false), [lightPreset]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      styleURL={STANDARD_STYLE}
      projection="globe"
      onPress={onPress}
      onCameraChanged={handleMapCameraChanged}
      onMapLoadingError={handleMapLoadingError}
      // Mapbox ToS requires the wordmark + attribution on-map — kept small
      // and tucked above the tab bar.
      logoEnabled
      logoPosition={{ bottom: 88, left: 8 }}
      attributionEnabled
      attributionPosition={{ bottom: 88, right: 8 }}
      compassEnabled={false}
      scaleBarEnabled={false}
    >
      <StyleImport
        id="basemap"
        existing
        // The same 3D city detail as the trip map (utils/mapLook): landmarks, facades, trees.
        config={globeConfig}
      />
      {/* Raised terrain: mountains read as mountains when you zoom into a region. */}
      <RasterDemSource id="terrain-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={514} maxZoomLevel={14}>
        <Terrain style={{ exaggeration: 1.4 }} />
      </RasterDemSource>
      <Camera
        ref={cameraRef}
        defaultSettings={{
          centerCoordinate: INITIAL_COORDS,
          zoomLevel: INITIAL_ZOOM,
        }}
        animationMode="none"
      />

      {heat ? (
        <ShapeSource id="heat" shape={heat}>
          <HeatmapLayer
            id="heat"
            maxZoomLevel={10}
            style={{
              heatmapWeight: ['interpolate', ['linear'], ['get', 'w'], 0, 0, 20, 1],
              heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 0, 0.35, 6, 1.2],
              // Tight at world view so Europe stays a glow with pins on it, not one blob (spec 2026-11-11).
              heatmapRadius: ['interpolate', ['linear'], ['zoom'], 0, 4, 3, 10, 6, 22],
              // Fades out as the map closes in, so pins and POIs take over (spec: 7 → 10).
              heatmapOpacity: ['interpolate', ['linear'], ['zoom'], 7, 0.85, 10, 0],
              heatmapColor: [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(76,63,168,0)',
                0.25, 'rgba(76,63,168,0.45)', // deep violet
                0.55, '#7F77DD', // brand purple
                0.85, '#D4537E', // brand pink
                0.95, '#FDE7B0', // pale amber, only at the very densest
              ],
            }}
          />
        </ShapeSource>
      ) : null}

      {destinationCollection.features.length > 0 && (
        <ShapeSource
          id="destination-places"
          ref={destinationSourceRef}
          shape={destinationCollection}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={5}
        >
          {/* Crowded regions group into a bubble with a count; it splits as you zoom (spec 2026-11-11). */}
          <CircleLayer
            id="destination-cluster"
            filter={['has', 'point_count']}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 25, 28],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.85,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="destination-cluster-count"
            filter={['has', 'point_count']}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: 12,
              textColor: '#ffffff',
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
              textRotationAlignment: 'viewport',
            }}
          />
          {/* Halo first, so it sits beneath the pin. A static ring rather
              than an animated pulse: Mapbox layer props cannot be driven by
              Animated without per-frame setState. Pin and halo grow with zoom
              so world view stays uncluttered. */}
          <CircleLayer
            id="destination-halo"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 9, 8, 16],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.18,
              circleEmissiveStrength: 1,
            }}
          />
          <CircleLayer
            id="destination-pin"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: [
                '+',
                ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 8],
                ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 100, 3],
              ],
              circleColor: DarkColors.brand.purple,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="destination-label"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              textField: ['get', 'name'],
              textSize: ['interpolate', ['linear'], ['zoom'], 2, 10, 8, 12],
              textColor: '#ffffff',
              textHaloColor: 'rgba(0,0,0,0.6)',
              textHaloWidth: 1,
              textOffset: [0, 1.4],
              textAnchor: 'top',
              // The more popular name wins a collision; the other appears as you zoom in.
              symbolSortKey: ['*', -1, ['coalesce', ['get', 'popularity'], 0]],
              // Upright and readable however the globe is tilted or turned.
              textPitchAlignment: 'viewport',
              textRotationAlignment: 'viewport',
            }}
          />
        </ShapeSource>
      )}

      {selectedCollection.features.length > 0 && (
        <ShapeSource id="selected-place" shape={selectedCollection}>
          {/* No maxZoomLevel — the selection stays visible at every zoom.
              This is also the only confirmation that a tap registered. */}
          <CircleLayer
            id="selected-circle"
            style={{
              circleRadius: 13,
              circleColor: DarkColors.brand.purple,
              circleStrokeWidth: 3,
              circleStrokeColor: '#ffffff',
            }}
          />
        </ShapeSource>
      )}
      {/* Friends on a trip — above the heat and the catalog pins: stacked at world view, spread apart when they share a city. */}
      {friendLayout.singles.map((f) => (
        <MarkerView key={`friend-${f.uid}`} coordinate={[f.lng, f.lat]} anchor={{ x: 0.5, y: 0.3 }} allowOverlap>
          <FriendTravelMarker friend={f} onPress={handleFriendPress} />
        </MarkerView>
      ))}
      {friendLayout.stacks.map((st) => (
        <MarkerView key={`stack-${st.key}`} coordinate={[st.lng, st.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <FriendStackMarker stack={st} onPress={handleStackPress} />
        </MarkerView>
      ))}
    </MapView>
  );
}
