/**
 * Trending destinations (docs/superpowers/specs/2026-10-11-trending-destinations-design.md):
 * anonymous per-city counts of trips started, turned into globe heat. Pure — no firebase-admin.
 */
import { seeded, r4, type GeoBox } from './discovery';

export type Triple = [number, number, number];
export const TREND_WINDOW_DAYS = 14;
/** Below this many trips in the window a city adds nothing: one private trip can never be spotted. */
export const TREND_MIN = 3;
const DAY_MS = 86_400_000;

export function trendDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Pt = { lat?: number | null; lng?: number | null } | null | undefined;
export function destinationPoints(trip: { destination?: Pt; additionalDestinations?: Pt[] | null }): { lat: number | null; lng: number | null }[] {
  return [trip.destination, ...(trip.additionalDestinations ?? [])].map((d) => ({ lat: d?.lat ?? null, lng: d?.lng ?? null }));
}

export function sameDestinationPoints(
  a: { destination?: Pt; additionalDestinations?: Pt[] | null } | null | undefined,
  b: { destination?: Pt; additionalDestinations?: Pt[] | null } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return JSON.stringify(destinationPoints(a)) === JSON.stringify(destinationPoints(b));
}

export function trendNewSlugs(before: string[], after: string[]): string[] {
  const had = new Set(before);
  return after.filter((s) => !had.has(s));
}

function windowStart(now: Date): string {
  return trendDayKey(new Date(now.getTime() - (TREND_WINDOW_DAYS - 1) * DAY_MS));
}

export function trendTotal(days: Record<string, number>, now: Date): number {
  const from = windowStart(now), to = trendDayKey(now);
  return Object.entries(days).reduce((n, [k, v]) => (k >= from && k <= to ? n + (Number(v) || 0) : n), 0);
}

export function trendWeight(n: number): number {
  return n < TREND_MIN ? 0 : Math.round(12 * Math.log2(1 + n));
}

export function trendPoints(dest: { slug: string; bbox: GeoBox }, weight: number): Triple[] {
  if (weight <= 0) return [];
  const { sw, ne } = dest.bbox;
  return Array.from({ length: 5 }, (_, i) => {
    // Its own seed ('trend:'), so the points don't sit on the baseline's.
    const fx = 0.2 + 0.6 * seeded(`trend:${dest.slug}`, i * 2);
    const fy = 0.2 + 0.6 * seeded(`trend:${dest.slug}`, i * 2 + 1);
    return [r4(sw[0] + (ne[0] - sw[0]) * fx), r4(sw[1] + (ne[1] - sw[1]) * fy), weight] as Triple;
  });
}

export function pruneTrendDays(days: Record<string, number>, now: Date): Record<string, number> {
  const from = windowStart(now);
  return Object.fromEntries(Object.entries(days).filter(([k]) => k >= from));
}

export function composeHeat(baseline: Triple[], trending: Triple[], community: Triple[], cap = 4000): Triple[] {
  return [...baseline, ...trending, ...community].sort((a, b) => b[2] - a[2]).slice(0, cap);
}
