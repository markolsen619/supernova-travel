import { haversineMeters, type CachedLeg, type MissingLeg } from '@/utils/tripRoutes';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export function parseDirectionsResponse(json: unknown): { polyline: string; meters: number } | null {
  const j = json as { code?: string; routes?: { geometry?: unknown; distance?: unknown }[] } | null;
  if (!j || j.code !== 'Ok') return null;
  const r = j.routes?.[0];
  if (!r || typeof r.geometry !== 'string' || typeof r.distance !== 'number') return null;
  return { polyline: r.geometry, meters: r.distance };
}

/** Mapbox codes that mean "there is no route here" — safe to remember as an arc. */
const NO_ROUTE_CODES = new Set(['NoRoute', 'NoSegment', 'InvalidInput']);

export type DirectionsOutcome =
  | { kind: 'route'; polyline: string; meters: number }
  | { kind: 'none' }
  | { kind: 'retry' };

/**
 * What a Directions response means for the cache. Only a definitive "no
 * route" becomes a cached arc; anything temporary (rate limit, outage, bad
 * token, empty body) is 'retry' and is never written, or one bad moment would
 * turn a leg into a straight line for every viewer, permanently.
 */
export function directionsOutcome(status: number, json: unknown): DirectionsOutcome {
  const code = (json as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && NO_ROUTE_CODES.has(code)) return { kind: 'none' };
  if (status < 200 || status >= 300) return { kind: 'retry' };
  const parsed = parseDirectionsResponse(json);
  return parsed ? { kind: 'route', ...parsed } : { kind: 'retry' };
}

/**
 * One leg from Mapbox Directions, or null when it should be retried later.
 * Never throws. A definitive "no route" (open water, no roads) comes back as
 * an arc so it's cached and not re-requested; temporary failures return null
 * and are not cached.
 */
export async function fetchLeg(leg: MissingLeg): Promise<CachedLeg | null> {
  if (!TOKEN) return null;
  const coords = `${leg.a.lng},${leg.a.lat};${leg.b.lng},${leg.b.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${leg.mode}/${coords}?geometries=polyline6&overview=simplified&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    const outcome = directionsOutcome(res.status, json);
    if (outcome.kind === 'route') return { mode: leg.mode, polyline: outcome.polyline, meters: outcome.meters };
    if (outcome.kind === 'none') return { mode: 'arc', polyline: null, meters: haversineMeters(leg.a, leg.b) };
    console.warn('[fetchLeg] will retry later: HTTP', res.status);
    return null;
  } catch (err) {
    console.warn('[fetchLeg] will retry later:', err);
    return null;
  }
}
