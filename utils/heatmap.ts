import type * as GeoJSON from 'geojson';
import type { Destination } from '@/utils/destinations';

/**
 * aggregates/heatmap stores points flattened — [lng, lat, w, lng, lat, w, …]
 * with stride 3 — because Firestore rejects nested arrays. Anything that
 * doesn't parse is skipped; a broken document draws no layer rather than
 * breaking the globe.
 */
export function heatFeatures(points: unknown, stride: unknown): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> {
  const features: GeoJSON.Feature<GeoJSON.Point, { w: number }>[] = [];
  if (Array.isArray(points) && stride === 3) {
    for (let i = 0; i + 2 < points.length; i += 3) {
      const [lng, lat, w] = [points[i], points[i + 1], points[i + 2]];
      if (![lng, lat, w].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      if (Math.abs(lat) > 90) continue;
      features.push({ type: 'Feature', properties: { w }, geometry: { type: 'Point', coordinates: [lng, lat] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function destinationPinFeatures(list: Destination[]): GeoJSON.FeatureCollection<GeoJSON.Point, { slug: string; name: string; weight: number }> {
  return {
    type: 'FeatureCollection',
    features: list.map((d) => ({
      type: 'Feature' as const,
      id: d.slug,
      properties: { slug: d.slug, name: d.name, weight: d.popularity },
      geometry: { type: 'Point' as const, coordinates: [d.center.lng, d.center.lat] },
    })),
  };
}

/** The destination pin under a tap, from queryRenderedFeaturesInRect on the pin layers. */
export function destinationSlugFromFeatures(fc: GeoJSON.FeatureCollection | undefined | null): string | null {
  for (const f of fc?.features ?? []) {
    const slug = (f.properties as { slug?: unknown } | null)?.slug;
    if (typeof slug === 'string' && slug) return slug;
  }
  return null;
}

/**
 * The globe layers a tap is tested against to open a destination page. The
 * halo is included: around a small pin the 22pt tap box often reaches only
 * the halo, and its feature carries a `name` — missed here, it would be taken
 * for a POI and sent to a billed Text Search.
 */
export const DESTINATION_PIN_LAYERS = ['destination-halo', 'destination-pin', 'destination-label'];

/**
 * The destination under a tap, or null. A failed query (layers not mounted
 * while the catalog loads, a native error) counts as "no pin" so the tap
 * carries on to the normal POI lookup instead of dying.
 */
export async function findDestinationAt(
  query: () => Promise<GeoJSON.FeatureCollection | undefined | null>,
): Promise<string | null> {
  try {
    return destinationSlugFromFeatures(await query());
  } catch {
    return null;
  }
}
