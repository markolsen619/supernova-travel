/** Reading Mapbox answers for past-trip stops (spec: nearest named place ≤ 100 m, else the neighbourhood). */
import type { DraftStop } from '@/utils/pastTrip';
import { haversineMeters } from '@/utils/tripRoutes';

export const NAMED_WITHIN_M = 100;
const FOOD = ['restaurant', 'cafe', 'coffee', 'bar', 'pub', 'food', 'bakery', 'brewery', 'winery'];
const STAY = ['hotel', 'hostel', 'lodging', 'motel', 'guest house', 'resort'];

type Feat = { properties?: { name?: unknown; poi_category?: unknown; coordinates?: { latitude?: unknown; longitude?: unknown } } };

export function poiFromSearchBox(json: unknown, at: { lat: number; lng: number }): { name: string; type: DraftStop['type'] } | null {
  const feats = (json as { features?: Feat[] } | null)?.features;
  if (!Array.isArray(feats)) return null;
  let best: { name: string; cats: string[]; d: number } | null = null;
  for (const f of feats) {
    const p = f?.properties;
    const lat = Number(p?.coordinates?.latitude);
    const lng = Number(p?.coordinates?.longitude);
    if (typeof p?.name !== 'string' || !p.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(at, { lat, lng });
    if (d > NAMED_WITHIN_M || (best && best.d <= d)) continue;
    best = { name: p.name.trim(), cats: Array.isArray(p.poi_category) ? p.poi_category.map(String) : [], d };
  }
  if (!best) return null;
  const has = (list: string[]) => best!.cats.some((c) => list.some((w) => c.toLowerCase().includes(w)));
  return { name: best.name, type: has(STAY) ? 'hotel' : has(FOOD) ? 'restaurant' : 'activity' };
}

type GeoFeat = { properties?: { feature_type?: unknown; name?: unknown; context?: { place?: { name?: unknown }; country?: { country_code?: unknown } } } };

export function areaFromGeocode(json: unknown): { neighbourhood: string | null; city: string | null; countryCode: string | null } {
  const f = ((json as { features?: GeoFeat[] } | null)?.features ?? [])[0]?.properties;
  if (!f) return { neighbourhood: null, city: null, countryCode: null };
  const type = String(f.feature_type ?? '');
  const name = typeof f.name === 'string' ? f.name : null;
  const neighbourhood = type === 'neighborhood' || type === 'locality' ? name : null;
  const city = type === 'place' ? name : typeof f.context?.place?.name === 'string' ? f.context.place.name : null;
  const cc = f.context?.country?.country_code;
  return { neighbourhood, city, countryCode: typeof cc === 'string' ? cc.toUpperCase() : null };
}

export function stopFallbackName(index: number): string {
  return `Stop ${index + 1}`;
}
