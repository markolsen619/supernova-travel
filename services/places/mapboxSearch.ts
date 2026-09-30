import { buildMapboxForwardUrl, normalizeMapboxFeature, type GroundedPlace } from '@/utils/mapboxQuery';
import { regionFromMapboxFeature, type PlaceRegion } from '@/utils/tripRegion';
import { isBboxUsable, type Bbox } from '@/utils/geoBounds';
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/**
 * Grounds one AI-authored searchQuery inside a hard bounding box.
 *
 * Returns null on no match — deliberately. Measured against representative
 * stop names, Mapbox with a soft `proximity` hint alone returned results
 * 5,000-8,000km away (a Peruvian museum for a Mexican one); with a hard `bbox`
 * it returned zero wrong answers and one honest miss. Callers must treat null
 * as "ask Google", never as "no such place".
 */
export async function searchPlaceInBounds(
  query: string,
  bbox: Bbox | null,
  center?: { lat: number; lng: number } | null,
): Promise<GroundedPlace | null> {
  if (!TOKEN || !query.trim()) return null;
  if (!isBboxUsable(bbox)) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({
      query, token: TOKEN, bbox, proximity: center ?? null, limit: 1,
    }));
    if (!res.ok) {
      console.error('[searchPlaceInBounds] HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { features?: unknown[] };
    return normalizeMapboxFeature(json.features?.[0] as never);
  } catch (error) {
    console.error('[searchPlaceInBounds] failed', error);
    return null;
  }
}

/**
 * Resolves a destination city to its bounding box.
 *
 * A city name plus a country filter is the unambiguous case for a geocoder:
 * "La Paz" + MX lands in Baja California Sur, not Bolivia. Free on the Search
 * Box tier, so every destination box costs nothing to obtain.
 */
export async function resolveCityBounds(
  name: string,
  countryCode: string | null,
): Promise<PlaceViewportBounds | null> {
  if (!TOKEN || !name.trim()) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({
      query: name, token: TOKEN, country: countryCode, types: 'place', limit: 1,
    }));
    if (!res.ok) {
      console.error('[resolveCityBounds] HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { features?: { properties?: { bbox?: number[] } }[] };
    const bbox = json.features?.[0]?.properties?.bbox;
    if (!bbox || bbox.length < 4) return null;
    const [w, s, e, n] = bbox;
    return { sw: [w, s], ne: [e, n] };
  } catch (error) {
    console.error('[resolveCityBounds] failed', error);
    return null;
  }
}

/**
 * A destination's state and country, for naming a multi-stop trip's region
 * (utils/tripRegion). By name rather than coordinates: an AI trip's first
 * stop has none until it's grounded, and a name plus country is exactly what
 * the geocoder is good at. Also matches a destination that is itself a region
 * or country ("Tuscany", "Portugal"). Free on the Search Box tier.
 */
export async function resolveDestinationRegion(
  name: string,
  countryCode: string | null,
): Promise<PlaceRegion | null> {
  if (!TOKEN || !name.trim()) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({
      query: name, token: TOKEN, country: countryCode, types: 'place,region,country', limit: 1,
    }));
    if (!res.ok) {
      console.error('[resolveDestinationRegion] HTTP', res.status);
      return null;
    }
    const json = (await res.json()) as { features?: unknown[] };
    return regionFromMapboxFeature(json.features?.[0] as never);
  } catch (error) {
    console.error('[resolveDestinationRegion] failed', error);
    return null;
  }
}
