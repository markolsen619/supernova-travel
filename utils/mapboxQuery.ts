import type { Bbox } from '@/utils/geoBounds';

/** Provider-neutral result of grounding one stop. `placeId` is populated only
 *  by the Google fallback; a Mapbox-grounded stop has coordinates and no Google
 *  identity, which is exactly the "grounded but not enriched" state the map
 *  renders and enrichPoiByNameAndCoords later upgrades on demand. */
export interface GroundedPlace {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  countryCode: string | null;
  source: 'mapbox' | 'google';
  placeId: string | null;
  mapboxId: string | null;
  /** A business (hotel, restaurant, shop…) rather than an area or address —
   *  the only kind of result a stop may be renamed after (utils/venueTitle). */
  isVenue: boolean;
}

export interface MapboxForwardParams {
  query: string;
  token: string;
  /** Hard restriction. Unlike `proximity`, results outside it are excluded —
   *  this is what turns a wrong answer into an honest miss. */
  bbox?: Bbox | null;
  proximity?: { lat: number; lng: number } | null;
  country?: string | null;
  types?: string | null;
  limit?: number;
}

const FORWARD_ENDPOINT = 'https://api.mapbox.com/search/searchbox/v1/forward';

export function buildMapboxForwardUrl(p: MapboxForwardParams): string {
  const qs = new URLSearchParams({
    q: p.query,
    access_token: p.token,
    limit: String(p.limit ?? 1),
    language: 'en',
  });
  if (p.bbox) qs.set('bbox', p.bbox.join(','));
  if (p.proximity) qs.set('proximity', `${p.proximity.lng},${p.proximity.lat}`);
  if (p.country) qs.set('country', p.country.toLowerCase());
  if (p.types) qs.set('types', p.types);
  return `${FORWARD_ENDPOINT}?${qs.toString()}`;
}

interface MapboxFeatureLike {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    full_address?: string;
    mapbox_id?: string;
    feature_type?: string;
    context?: { country?: { country_code?: string } };
  };
}

export function normalizeMapboxFeature(f: MapboxFeatureLike | undefined | null): GroundedPlace | null {
  const coords = f?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    name: f?.properties?.name ?? '',
    lat,
    lng,
    address: f?.properties?.full_address ?? null,
    countryCode: f?.properties?.context?.country?.country_code?.toUpperCase() ?? null,
    source: 'mapbox',
    placeId: null,
    mapboxId: f?.properties?.mapbox_id ?? null,
    isVenue: f?.properties?.feature_type === 'poi',
  };
}

const placeWords = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

/**
 * Of several in-box results, the one named most like the place part of the
 * query (before its first comma). Mapbox ranked "San Diego International
 * Airport" above "Belmont Park" for "Belmont Park, San Diego" — the city in the
 * query matched the airport's name — and the first result was taken.
 * Ties (and no overlap at all) keep Mapbox's own order.
 */
export function pickBestFeature<T extends { properties?: { name?: string } }>(query: string, features: T[]): T | undefined {
  if (features.length === 0) return undefined;
  const want = placeWords(query.split(',')[0] ?? query);
  if (want.length === 0) return features[0];
  let best = features[0];
  let bestScore = -1;
  for (const f of features) {
    const have = new Set(placeWords(f.properties?.name ?? ''));
    const score = want.filter((w) => have.has(w)).length / want.length;
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return best;
}

/**
 * The query to ask again with when a boxed answer isn't the place: the name alone
 * ("Belmont Park, San Diego" → "Belmont Park"), or null when the answer shares a word
 * of the name or there is no suffix to drop. Boxed to San Diego with a city-centre
 * proximity, Mapbox answered that query with the airport alone — the city words
 * outranked the place's — while the name alone found the park. The box already
 * holds the city, so dropping the suffix loses nothing there.
 */
export function nameOnlyRetry(query: string, picked: { properties?: { name?: string } } | undefined): string | null {
  const comma = query.indexOf(',');
  if (comma < 0) return null;
  const name = query.slice(0, comma).trim();
  const want = placeWords(name);
  if (want.length === 0) return null;
  const have = new Set(placeWords(picked?.properties?.name ?? ''));
  return want.some((w) => have.has(w)) ? null : name;
}
