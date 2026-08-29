import React from 'react';
import { StyleSheet } from 'react-native';
import {
  MapView,
  Camera,
  StyleImport,
  setAccessToken,
} from '@rnmapbox/maps';
import type { CameraHandle } from '@/hooks/useFlyTo';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import type { TrendingPlace } from '@/utils/trendingPlaces';
import type { LightPreset } from '@/services/mapLighting';
import type * as GeoJSON from 'geojson';

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
export type ScreenPointPayload = { screenPointX: number; screenPointY: number };

// Set token once at module load — before any MapView renders
setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

// Initial camera: wide-angle globe view centred on 0°N 20°W
export const INITIAL_ZOOM = 1.5;
export const INITIAL_COORDS: [number, number] = [0, 20]; // [lng, lat]

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
}: GlobeMapViewProps) {
  const handleMapLoadingError = React.useCallback(() => {
    console.error('[SearchMap] Mapbox Standard style failed to load — check EXPO_PUBLIC_MAPBOX_TOKEN and network.');
  }, []);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      styleURL={STANDARD_STYLE}
      projection="globe"
      onPress={onPress}
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
    </MapView>
  );
}
