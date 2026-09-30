/**
 * Pure rules behind destination pages and the globe heat map. No
 * firebase-admin, so every decision is tested (__tests__/functions/discovery).
 */
export interface GeoBox { sw: [number, number]; ne: [number, number] }
export interface TaggableDestination { slug: string; bbox: GeoBox }

function inBox(lat: number, lng: number, b: GeoBox): boolean {
  return lng >= b.sw[0] && lng <= b.ne[0] && lat >= b.sw[1] && lat <= b.ne[1];
}

/** Catalog destinations a trip visits: every box containing any grounded point, overlaps included. */
export function destinationKeysFor(
  points: { lat: number | null; lng: number | null }[],
  catalog: TaggableDestination[],
): string[] {
  const keys = new Set<string>();
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    for (const d of catalog) if (inBox(p.lat, p.lng, d.bbox)) keys.add(d.slug);
  }
  return [...keys].sort();
}

/** Lets tagTripDestinations skip a write that changes nothing — its own write re-triggers it. */
export function sameKeys(a: string[] | undefined, b: string[]): boolean {
  const x = a ?? [];
  return x.length === b.length && x.every((k, i) => k === b[i]);
}

/** Only public, un-hidden, tagged trips feed destination pages and the heat map. */
export function isAggregatable(trip: { visibility?: string; moderationHidden?: boolean; destinationKeys?: string[] }): boolean {
  return trip.visibility === 'public' && !trip.moderationHidden && (trip.destinationKeys?.length ?? 0) > 0;
}

export interface StopForRanking { placeId: string | null; name: string; type: string; lat: number; lng: number; tripId: string; saves: number }
export interface TopPlace { name: string; type: string; lat: number; lng: number; placeId: string | null; itineraryCount: number }

/** Places ranked by how many itineraries include them (each trip counted once), ties by saves. */
export function rankTopPlaces(stops: StopForRanking[], limit = 12): TopPlace[] {
  const groups = new Map<string, { place: TopPlace; trips: Set<string>; saves: number }>();
  for (const s of stops) {
    const key = s.placeId ? `id:${s.placeId}` : `at:${s.name.trim().toLowerCase()}@${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
    const g = groups.get(key) ?? {
      place: { name: s.name, type: s.type, lat: s.lat, lng: s.lng, placeId: s.placeId, itineraryCount: 0 },
      trips: new Set<string>(),
      saves: 0,
    };
    if (!g.trips.has(s.tripId)) {
      g.trips.add(s.tripId);
      g.saves += s.saves;
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g.place, itineraryCount: g.trips.size, saves: g.saves }))
    .sort((a, b) => b.itineraryCount - a.itineraryCount || b.saves - a.saves || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ saves: _saves, ...p }) => p);
}

/** Deterministic 0–1 value from a string — the same destination always gets the same spread. */
function seeded(slug: string, i: number): number {
  let h = 2166136261;
  for (const c of `${slug}#${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** The world baseline: a destination's popularity spread over five points inside its box. */
export function baselinePoints(dest: { slug: string; popularity: number; bbox: GeoBox }): [number, number, number][] {
  const { sw, ne } = dest.bbox;
  const weight = Math.round(dest.popularity / 5);
  return Array.from({ length: 5 }, (_, i) => {
    // Middle 60% of the box: the city, not its outskirts.
    const fx = 0.2 + 0.6 * seeded(dest.slug, i * 2);
    const fy = 0.2 + 0.6 * seeded(dest.slug, i * 2 + 1);
    return [r4(sw[0] + (ne[0] - sw[0]) * fx), r4(sw[1] + (ne[1] - sw[1]) * fy), weight];
  });
}

/** Baseline plus community stops (1 + 2·saves + likes), heaviest first, capped. */
export function buildHeatPoints(
  baseline: [number, number, number][],
  community: { lat: number; lng: number; saves: number; likes: number }[],
  cap = 4000,
): [number, number, number][] {
  const all: [number, number, number][] = [
    ...baseline,
    ...community.map((c) => [r4(c.lng), r4(c.lat), 1 + 2 * c.saves + c.likes] as [number, number, number]),
  ];
  return all.sort((a, b) => b[2] - a[2]).slice(0, cap);
}
