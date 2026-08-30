import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  setAccessToken,
} from '@rnmapbox/maps';
import type { CameraHandle } from '@/hooks/useFlyTo';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import type { TrendingPlace } from '@/utils/trendingPlaces';
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
 * Trending pins stop drawing here; Standard's own POI labels arrive around
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
  trendingPlaces?: TrendingPlace[];
  selectedPlace?: EnrichedPlace | null;
}

export function GlobeMapView({
  cameraRef,
  mapRef,
  lightPreset,
  onPress,
  onCameraChanged,
  trendingPlaces,
  selectedPlace,
}: GlobeMapViewProps) {
  const handleMapLoadingError = React.useCallback(() => {
    console.error('[SearchMap] Mapbox Standard style failed to load — check EXPO_PUBLIC_MAPBOX_TOKEN and network.');
  }, []);

  const trendingCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (trendingPlaces ?? []).map((p) => ({
        type: 'Feature' as const,
        id: p.key,
        properties: { name: p.name, weight: p.weight, tripCount: p.tripCount },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
    }),
    [trendingPlaces],
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
      onCameraChanged={(state) => onCameraChanged?.(state.properties.zoom)}
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

      {trendingCollection.features.length > 0 && (
        <ShapeSource id="trending-places" shape={trendingCollection}>
          {/* Halo first, so it sits beneath the pin. A static ring rather
              than an animated pulse: Mapbox layer props cannot be driven by
              Animated without per-frame setState, which is a real cost for
              a decorative effect. */}
          <CircleLayer
            id="trending-halo"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 11, 100, 19],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.18,
            }}
          />
          <CircleLayer
            id="trending-circle"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 100, 11],
              circleColor: DarkColors.brand.purple,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
            }}
          />
          <SymbolLayer
            id="trending-label"
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
