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
  };
}
