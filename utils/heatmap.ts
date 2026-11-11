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

export function destinationPinFeatures(list: Destination[]): GeoJSON.FeatureCollection<GeoJSON.Point, { slug: string; name: string; weight: number; popularity: number }> {
  return {
    type: 'FeatureCollection',
    features: list.map((d) => ({
      type: 'Feature' as const,
      id: d.slug,
      properties: { slug: d.slug, name: d.name, weight: d.popularity ?? 0, popularity: d.popularity ?? 0 },
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
export const DESTINATION_PIN_LAYERS = ['destination-cluster', 'destination-cluster-count', 'destination-halo', 'destination-pin', 'destination-label'];

export type GlobeTap = { kind: 'cluster'; clusterId: number; coordinates: [number, number]; count: number } | { kind: 'destination'; slug: string };

/** What a globe tap hit (spec 2026-11-11): a bubble wins over a pin under it; friends are native markers and never reach here. */
export function globeTapTarget(fc: GeoJSON.FeatureCollection | null | undefined): GlobeTap | null {
  for (const f of fc?.features ?? []) {
    const p = (f.properties ?? {}) as { cluster_id?: unknown; point_count?: unknown };
    if (typeof p.cluster_id === 'number' && f.geometry?.type === 'Point') {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      return { kind: 'cluster', clusterId: p.cluster_id, coordinates: [lng, lat], count: typeof p.point_count === 'number' ? p.point_count : 0 };
    }
  }
  const slug = destinationSlugFromFeatures(fc ?? null);
  return slug ? { kind: 'destination', slug } : null;
}

/** Where a bubble tap flies: just past the zoom where it splits, else two levels closer; never past street level. */
export function clusterFlyZoom(expansionZoom: number | null, currentZoom: number): number {
  return Math.min(12, expansionZoom != null ? expansionZoom + 0.2 : currentZoom + 2);
}

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
