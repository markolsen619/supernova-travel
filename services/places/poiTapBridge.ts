import type * as GeoJSON from 'geojson';

export interface TappedPoi {
  name: string;
  lat: number;
  lng: number;
  /** Stable key for usePlacesStore cache */
  cacheKey: string;
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function makeCacheKey(name: string, lat: number, lng: number): string {
  return `${name.toLowerCase()}::${roundCoord(lat)}::${roundCoord(lng)}`;
}

/** Squared degree distance — ordering only, so no need for a real projection. */
function distanceSq(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = aLat - bLat;
  const dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng;
}

function nameOf(feature: GeoJSON.Feature): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  return (
    (props['name_en'] as string | undefined) ??
    (props['name'] as string | undefined) ??
    (props['title'] as string | undefined) ??
    ''
  );
}

/**
 * Extracts the POI nearest a tap from a queryRenderedFeatures result.
 *
 * Point geometry is REQUIRED, not preferred. Mapbox returns everything drawn
 * under the tap — water and landuse polygons, road lines, admin boundaries —
 * and all of them carry names. The previous implementation took the first
 * named feature of any geometry and fell back to the tap coordinates, so a
 * near-miss could resolve "Pacific Ocean" and then spend a billed Google Text
 * Search resolving it. Only labels are Points, so this single constraint
 * removes that entire class of failure.
 *
 * tapLat/tapLng are the reference point for choosing between several
 * candidates — never a coordinate fallback.
 */
export function extractPoiFromFeatures(
  collection: GeoJSON.FeatureCollection | undefined,
  tapLat: number,
  tapLng: number,
): TappedPoi | null {
  if (!collection || collection.features.length === 0) return null;

  let best: TappedPoi | null = null;
  let bestDistance = Infinity;

  for (const feature of collection.features) {
    if (feature.geometry?.type !== 'Point') continue;

    const name = nameOf(feature);
    if (!name) continue;

    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const d = distanceSq(lat, lng, tapLat, tapLng);
    if (d < bestDistance) {
      bestDistance = d;
      best = { name, lat, lng, cacheKey: makeCacheKey(name, lat, lng) };
    }
  }

  return best;
}
