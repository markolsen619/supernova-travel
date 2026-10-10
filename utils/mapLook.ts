import type { LightPreset } from '@/services/mapLighting';

/**
 * How the trip map looks (2026-10-09). Two basemaps:
 *  - 'map'       — Mapbox Standard with every 3D detail on: buildings with
 *                  facades, landmark models (Prague Castle, the Eiffel Tower),
 *                  trees. The flyover's default: cities read as cities.
 *  - 'satellite' — Standard Satellite: real imagery of mountains, rivers and
 *                  coasts. It has no 3D buildings or landmarks (Mapbox offers
 *                  none for it), so it's the traveller's choice, not the default.
 * Terrain is added separately (TripMapView). A flyover always plays in daylight.
 */
export type Basemap = 'map' | 'satellite';

export function basemapStyleUrl(b: Basemap): string {
  return b === 'satellite' ? 'mapbox://styles/mapbox/standard-satellite' : 'mapbox://styles/mapbox/standard';
}

export function basemapConfig(b: Basemap, now: LightPreset, flying: boolean): Record<string, string | boolean> {
  const lightPreset = flying ? 'day' : now;
  if (b === 'satellite') {
    return { lightPreset, showPlaceLabels: true, showPointOfInterestLabels: true, showRoadLabels: true };
  }
  return {
    lightPreset,
    showPointOfInterestLabels: true,
    showLandmarkIcons: true,
    showLandmarkIconLabels: true,
    show3dBuildings: true,
    show3dFacades: true,
    show3dLandmarks: true,
    show3dTrees: true,
  };
}

/**
 * The camera on arriving at a stop: low and close (3D landmarks draw from about
 * zoom 15), then a slow quarter-circle around it while the card shows the stop.
 * Each stop is approached from a different side so a day doesn't feel repetitive.
 */
export function arrivalCamera(stopIndex: number): { zoom: number; pitch: number; heading: number; orbitTo: number } {
  const heading = (stopIndex * 67) % 360;
  return { zoom: 16.6, pitch: 64, heading, orbitTo: heading + 35 };
}
