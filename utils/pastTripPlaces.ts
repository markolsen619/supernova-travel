/** Reading Mapbox answers for past-trip stops (spec: nearest named place ≤ 100 m, else the neighbourhood). */
import type { DraftStop } from '@/utils/pastTrip';
import { haversineMeters } from '@/utils/tripRoutes';

export const NAMED_WITHIN_M = 100;
const FOOD = ['restaurant', 'cafe', 'coffee', 'bar', 'pub', 'food', 'bakery', 'brewery', 'winery'];
const STAY = ['hotel', 'hostel', 'lodging', 'motel', 'guest house', 'resort'];

type Feat = { properties?: { name?: unknown; poi_category?: unknown; coordinates?: { latitude?: unknown; longitude?: unknown } } };

export function poiFromSearchBox(json: unknown, at: { lat: number; lng: number }): { name: string; type: DraftStop['type']; lat: number; lng: number } | null {
  const feats = (json as { features?: Feat[] } | null)?.features;
  if (!Array.isArray(feats)) return null;
  let best: { name: string; cats: string[]; d: number; lat: number; lng: number } | null = null;
  for (const f of feats) {
    const p = f?.properties;
    const lat = Number(p?.coordinates?.latitude);
    const lng = Number(p?.coordinates?.longitude);
    if (typeof p?.name !== 'string' || !p.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(at, { lat, lng });
    if (d > NAMED_WITHIN_M || (best && best.d <= d)) continue;
    best = { name: p.name.trim(), cats: Array.isArray(p.poi_category) ? p.poi_category.map(String) : [], d, lat, lng };
  }
  if (!best) return null;
  const has = (list: string[]) => best!.cats.some((c) => list.some((w) => c.toLowerCase().includes(w)));
  return { name: best.name, type: has(STAY) ? 'hotel' : has(FOOD) ? 'restaurant' : 'activity', lat: best.lat, lng: best.lng };
}

type GeoFeat = { geometry?: { coordinates?: unknown }; properties?: { feature_type?: unknown; name?: unknown; context?: { place?: { name?: unknown }; country?: { country_code?: unknown; name?: unknown } } } };

type Area = { neighbourhood: string | null; city: string | null; countryCode: string | null; country?: string | null; center: { lat: number; lng: number } | null };

export function areaFromGeocode(json: unknown): Area {
  const feat = ((json as { features?: GeoFeat[] } | null)?.features ?? [])[0];
  const f = feat?.properties;
  if (!f) return { neighbourhood: null, city: null, countryCode: null, center: null };
  const c = Array.isArray(feat?.geometry?.coordinates) ? (feat!.geometry!.coordinates as unknown[]).map(Number) : [];
  const center = c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lat: c[1], lng: c[0] } : null;
  const type = String(f.feature_type ?? '');
  const name = typeof f.name === 'string' ? f.name : null;
  const neighbourhood = type === 'neighborhood' || type === 'locality' ? name : null;
  const city = type === 'place' ? name : typeof f.context?.place?.name === 'string' ? f.context.place.name : null;
  const cc = f.context?.country?.country_code;
  const country = typeof f.context?.country?.name === 'string' ? f.context.country.name : type === 'country' ? name : null;
  return { neighbourhood, city, countryCode: typeof cc === 'string' ? cc.toUpperCase() : null, ...(country ? { country } : {}), center };
}

export function stopFallbackName(index: number): string {
  return `Stop ${index + 1}`;
}

/**
 * Where a stop is saved and shown (final review C1): the matched place's own position, else its neighbourhood's
 * centre, else rounded to ~1 km — never the photos' own position, which can be someone's home.
 */
export function publicPosition(
  poi: { lat: number; lng: number } | null,
  areaCenter: { lat: number; lng: number } | null,
  raw: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (poi) return { lat: poi.lat, lng: poi.lng };
  if (areaCenter) return { lat: areaCenter.lat, lng: areaCenter.lng };
  return { lat: Math.round(raw.lat * 100) / 100, lng: Math.round(raw.lng * 100) / 100 };
}

/**
 * A photo stop's name (owner, 2026-10-26): "Neighbourhood, City", else "City, Country" — never the nearest business,
 * which was nearly always a random shop ("Draijer Makelaardij", a rental flat's listing). Null when nothing is known.
 */
export function stopNameFor(a: { neighbourhood: string | null; city: string | null; country: string | null }): string | null {
  const same = (x: string | null, y: string | null) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();
  // An area named after its town ("Athlone and Bigmeadow") would repeat it: use "City, Country" instead.
  const holdsCity = !!a.neighbourhood && !!a.city && a.neighbourhood.toLowerCase().includes(a.city.trim().toLowerCase());
  if (a.neighbourhood && a.city && !same(a.neighbourhood, a.city) && !holdsCity) return `${a.neighbourhood}, ${a.city}`;
  if (a.city) return a.country ? `${a.city}, ${a.country}` : a.city;
  if (a.neighbourhood) return a.country ? `${a.neighbourhood}, ${a.country}` : a.neighbourhood;
  return a.country ?? null;
}
