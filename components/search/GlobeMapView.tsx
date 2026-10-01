import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  HeatmapLayer,
  setAccessToken,
  type MapState,
} from '@rnmapbox/maps';
import type { CameraHandle } from '@/hooks/useFlyTo';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import { destinationPinFeatures } from '@/utils/heatmap';
import type { Destination } from '@/utils/destinations';
import type { LightPreset } from '@/services/mapLighting';
import { DarkColors } from '@/constants/colors';
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
}: GlobeMapViewProps) {
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
        config={{
          lightPreset,
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

      {heat ? (
        <ShapeSource id="heat" shape={heat}>
          <HeatmapLayer
            id="heat"
            maxZoomLevel={10}
            style={{
              heatmapWeight: ['interpolate', ['linear'], ['get', 'w'], 0, 0, 20, 1],
              heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 0, 0.6, 7, 1.6],
              heatmapRadius: ['interpolate', ['linear'], ['zoom'], 0, 6, 4, 18, 7, 30],
              // Fades out as the map closes in, so pins and POIs take over (spec: 7 → 10).
              heatmapOpacity: ['interpolate', ['linear'], ['zoom'], 7, 0.85, 10, 0],
              heatmapColor: [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(76,63,168,0)',
                0.2, 'rgba(76,63,168,0.55)', // deep violet
                0.5, '#7F77DD', // brand purple
                0.8, '#D4537E', // brand pink
                1, '#FDE7B0', // pale amber
              ],
            }}
          />
        </ShapeSource>
      ) : null}

      {destinationCollection.features.length > 0 && (
        <ShapeSource id="destination-places" shape={destinationCollection}>
          {/* Halo first, so it sits beneath the pin. A static ring rather
              than an animated pulse: Mapbox layer props cannot be driven by
              Animated without per-frame setState, which is a real cost for
              a decorative effect. */}
          <CircleLayer
            id="destination-halo"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 11, 100, 19],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.18,
              circleEmissiveStrength: 1,
            }}
          />
          <CircleLayer
            id="destination-pin"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 100, 11],
              circleColor: DarkColors.brand.purple,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="destination-label"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            style={{
              textField: ['get', 'name'],
              textSize: 11,
              textColor: '#ffffff',
              textHaloColor: 'rgba(0,0,0,0.6)',
              textHaloWidth: 1,
              textOffset: [0, 1.4],
              textAnchor: 'top',
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
    </MapView>
  );
}
