import type * as GeoJSON from 'geojson';
import { flightAltitudeMeters, type BuiltPath } from '@/utils/tripRoutes';

export interface RouteInput {
  path: BuiltPath;
  color: string;
  /** Position in the flyover's sequence; -1 for a line the flyover never draws. */
  flightIndex: number;
  /** Drawn faintly under the Actual route. */
  faded: boolean;
}

/**
 * One GeoJSON line per leg, so each can be styled by how it's travelled:
 * a road or footpath, a dashed rail or ferry line, or a flight arc lifted off
 * the ground to `alt` metres (lineZOffset, peaking mid-leg).
 */
export function routeFeatures(inputs: RouteInput[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const { path, color, flightIndex, faded } of inputs) {
    path.legs.forEach((leg, legIdx) => {
      const coordinates = path.coordinates.slice(leg.from, leg.to + 1);
      if (coordinates.length < 2) return;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          color,
          flightIndex,
          faded,
          legIdx,
          travel: leg.travel,
          alt: leg.travel === 'flight' ? flightAltitudeMeters(leg.meters) : 0,
        },
      });
    });
  }
  return { type: 'FeatureCollection', features };
}
