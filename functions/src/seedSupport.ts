import type { GeoBox } from './discovery';

/** Pure request builders and parsers for scripts/seed-destinations.mjs (compiled to functions/lib). */
const SEARCHBOX = 'https://api.mapbox.com/search/searchbox/v1/forward';

export const GOOGLE_GROUNDING_MASK = 'places.id,places.displayName,places.location';
export const GOOGLE_COVER_MASK = 'places.id,places.displayName,places.location,places.photos';

export function mapboxPlaceUrl(query: string, token: string, countryCode?: string | null): string {
  const qs = new URLSearchParams({ q: query, access_token: token, limit: '1', language: 'en', types: 'place,region,locality,district' });
  if (countryCode) qs.set('country', countryCode.toLowerCase());
  return `${SEARCHBOX}?${qs.toString()}`;
}

export function parsePlaceFeature(json: unknown): { lng: number; lat: number; bbox: GeoBox | null; name: string } | null {
  const f = (json as { features?: { geometry?: { coordinates?: number[] }; properties?: { name?: string; bbox?: number[] } }[] })?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!c || c.length < 2) return null;
  const b = f?.properties?.bbox;
  return {
    lng: c[0],
    lat: c[1],
    name: f?.properties?.name ?? '',
    bbox: b && b.length >= 4 ? { sw: [b[0], b[1]], ne: [b[2], b[3]] } : null,
  };
}

/** A usable grounding box: the geocoder's, unless missing or smaller than ±minDegrees around the centre. */
export function padBox(center: [number, number], bbox: GeoBox | null, minDegrees = 0.1): GeoBox {
  if (bbox && bbox.ne[0] - bbox.sw[0] >= minDegrees * 2 && bbox.ne[1] - bbox.sw[1] >= minDegrees * 2) return bbox;
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { sw: [r(center[0] - minDegrees), r(center[1] - minDegrees)], ne: [r(center[0] + minDegrees), r(center[1] + minDegrees)] };
}

export function mapboxPoiUrl(query: string, token: string, bbox: GeoBox, center: [number, number]): string {
  const qs = new URLSearchParams({
    q: query, access_token: token, limit: '1', language: 'en',
    bbox: [...bbox.sw, ...bbox.ne].join(','), proximity: center.join(','),
  });
  return `${SEARCHBOX}?${qs.toString()}`;
}

export function googleTextSearchBody(query: string, center: [number, number] | null): object {
  return {
    textQuery: query,
    maxResultCount: 1,
    languageCode: 'en',
    ...(center ? { locationBias: { circle: { center: { latitude: center[1], longitude: center[0] }, radius: 30_000 } } } : {}),
  };
}

export function parseGooglePlace(json: unknown): { placeId: string; name: string; lat: number; lng: number; photoName: string | null } | null {
  const p = (json as { places?: { id?: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; photos?: { name?: string }[] }[] })?.places?.[0];
  if (!p?.id || p.location?.latitude == null || p.location?.longitude == null) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    photoName: p.photos?.[0]?.name ?? null,
  };
}

/** Same URL shape the app stores for trip covers (services/places/googlePlaces photoUrl). */
export function coverPhotoUrl(photoName: string, key: string): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${key}`;
}
