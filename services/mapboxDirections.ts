import { haversineMeters, type CachedLeg, type MissingLeg } from '@/utils/tripRoutes';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export function parseDirectionsResponse(json: unknown): { polyline: string; meters: number } | null {
  const j = json as { code?: string; routes?: { geometry?: unknown; distance?: unknown }[] } | null;
  if (!j || j.code !== 'Ok') return null;
  const r = j.routes?.[0];
  if (!r || typeof r.geometry !== 'string' || typeof r.distance !== 'number') return null;
  return { polyline: r.geometry, meters: r.distance };
}

/**
 * One leg from Mapbox Directions. Called once per leg ever — the result is
 * cached on the trip (hooks/useTripRoutes). Never throws: anything that
 * isn't a route becomes an arc, and the arc is cached too so an unroutable
 * leg (open water, no roads) isn't retried on every open.
 */
export async function fetchLeg(leg: MissingLeg): Promise<CachedLeg> {
  const arc: CachedLeg = { mode: 'arc', polyline: null, meters: haversineMeters(leg.a, leg.b) };
  if (!TOKEN) return arc;
  const coords = `${leg.a.lng},${leg.a.lat};${leg.b.lng},${leg.b.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${leg.mode}/${coords}?geometries=polyline6&overview=simplified&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[fetchLeg] HTTP', res.status);
      return arc;
    }
    const parsed = parseDirectionsResponse(await res.json());
    return parsed ? { mode: leg.mode, polyline: parsed.polyline, meters: parsed.meters } : arc;
  } catch (err) {
    console.error('[fetchLeg] failed', err);
    return arc;
  }
}
