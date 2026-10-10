import type { LightPreset } from '@/services/mapLighting';

/**
 * How the trip map looks. One style always — Mapbox Standard with every 3D
 * detail on (buildings with facades, landmark models, trees). "Satellite" is
 * Mapbox's imagery tiles laid in Standard's bottom slot, under its roads,
 * labels and 3D buildings — not a second style: swapping the whole style
 * mid-session (build 31) left the map blank, and Standard Satellite has no 3D
 * buildings or landmarks anyway. A flyover always plays in daylight.
 */
export type Basemap = 'map' | 'satellite';

export const SATELLITE_TILES = 'mapbox://mapbox.satellite';

export function basemapConfig(now: LightPreset, flying: boolean): Record<string, string | boolean> {
  return {
    lightPreset: flying ? 'day' : now,
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
 * The camera at a stop, where the flyover pauses: close enough for 3D buildings
 * and landmarks (~15+), then a slow quarter-circle while the card shows the stop.
 * Only here — legs between stops stay wide (zoomForLeg) so tiles keep up with a
 * moving camera. Each stop is approached from a different side.
 */
export function arrivalCamera(stopIndex: number): { zoom: number; pitch: number; heading: number; orbitTo: number } {
  const heading = (stopIndex * 67) % 360;
  return { zoom: 15.5, pitch: 60, heading, orbitTo: heading + 35 };
}
