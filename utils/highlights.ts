/**
 * Playback highlights for long trips (spec 2026-10-31-trip-highlights-playback-design.md): a chapter per city
 * (consecutive days in one city), one moment per day at a real stop near the middle of that day, and how the
 * traveler got from one city to the next. Pure.
 */
import { haversineMeters, legTravel, type RouteStop, type Travel } from '@/utils/tripRoutes';

export const HIGHLIGHT_MIN_DAYS = 5;
export const HIGHLIGHT_MIN_STOPS = 26;
export const CITY_RADIUS_M = 50_000;

export const isLongTrip = (dayCount: number, stopCount: number) => dayCount >= HIGHLIGHT_MIN_DAYS || stopCount >= HIGHLIGHT_MIN_STOPS;
/** Highlights are the Planned view; Actual mode keeps the visited route as it is. */
export const highlightsActive = (i: { long: boolean; actualMode: boolean }) => i.long && !i.actualMode;

export interface HStop { id: string; dayId: string; lat: number; lng: number; searchQuery: string | null; route: RouteStop }
export interface HDay { id: string; dayNumber: number; title: string | null; savedCity: string | null }
export interface Moment { dayId: string; dayNumber: number; label: string | null; stopId: string }
export interface Chapter {
  cityName: string | null;
  center: { lat: number; lng: number };
  dayNumbers: number[];
  moments: Moment[];
  arrival: { travel: Travel; fromStopId: string } | null;
}

export function stripDayPrefix(title: string | null): string | null {
  if (!title) return null;
  const t = title.replace(/^\s*day\s*\d+\s*[:\-–—·.]?\s*/i, '').trim();
  return t || null;
}

/** The most common last part of the stops' search text ("Senso-ji, Tokyo" → Tokyo), ignoring codes and numbers. */
export function cityFromQueries(queries: (string | null)[]): string | null {
  const count = new Map<string, number>();
  for (const q of queries) {
    if (!q || !q.includes(',')) continue;
    const last = q.split(',').pop()!.trim();
    if (!last || /\d/.test(last) || /^[A-Z]{2,3}$/.test(last)) continue;
    count.set(last, (count.get(last) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  for (const [k, v] of count) if (v > n) { best = k; n = v; }
  return best;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const middle = (stops: { lat: number; lng: number }[]) => ({ lat: median(stops.map((s) => s.lat)), lng: median(stops.map((s) => s.lng)) });

export function momentStop(stops: HStop[]): HStop | null {
  if (stops.length === 0) return null;
  const mid = middle(stops);
  let best = stops[0], d = Infinity;
  for (const s of stops) { const x = haversineMeters(s, mid); if (x < d) { d = x; best = s; } }
  return best;
}

export function arrivalTravel(from: RouteStop, to: RouteStop): Travel {
  const t = legTravel(from, to);
  return t === 'walk' ? 'drive' : t;
}

export function tripChapters(days: HDay[], stops: HStop[]): Chapter[] {
  const byDay = new Map<string, HStop[]>();
  for (const s of stops) byDay.set(s.dayId, [...(byDay.get(s.dayId) ?? []), s]);
  const ordered = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  // A city key per day: the saved city, else the nearest cluster within 50 km.
  const clusters: { lat: number; lng: number }[] = [];
  const keys: (string | null)[] = ordered.map((d) => {
    if (d.savedCity) return `saved:${d.savedCity}`;
    const own = byDay.get(d.id) ?? [];
    if (own.length === 0) return null;
    const at = middle(own);
    let best = -1, bestD = Infinity;
    clusters.forEach((c, i) => { const x = haversineMeters(c, at); if (x < bestD) { bestD = x; best = i; } });
    if (best >= 0 && bestD <= CITY_RADIUS_M) return `c:${best}`;
    clusters.push(at);
    return `c:${clusters.length - 1}`;
  });
  // Days without located stops take the previous day's city (the first ones, the next known one).
  for (let i = 0; i < keys.length; i++) if (keys[i] === null && i > 0) keys[i] = keys[i - 1];
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i] === null && i < keys.length - 1) keys[i] = keys[i + 1];

  const chapters: (Chapter & { key: string | null; stops: HStop[] })[] = [];
  ordered.forEach((d, i) => {
    const last = chapters[chapters.length - 1];
    const own = byDay.get(d.id) ?? [];
    const target = last && last.key === keys[i] ? last : null;
    const ch = target ?? (() => {
      const c = { key: keys[i], cityName: d.savedCity, center: { lat: 0, lng: 0 }, dayNumbers: [], moments: [], arrival: null, stops: [] } as Chapter & { key: string | null; stops: HStop[] };
      chapters.push(c);
      return c;
    })();
    ch.dayNumbers.push(d.dayNumber);
    ch.stops.push(...own);
    const m = momentStop(own);
    if (m) ch.moments.push({ dayId: d.id, dayNumber: d.dayNumber, label: stripDayPrefix(d.title), stopId: m.id });
  });

  const stopById = new Map(stops.map((s) => [s.id, s]));
  return chapters.filter((c) => c.moments.length > 0).map((c, i, all) => {
    const { key: _key, stops: own, ...rest } = c;
    const prev = all[i - 1];
    const fromId = prev ? prev.moments[prev.moments.length - 1].stopId : null;
    const toStop = stopById.get(c.moments[0].stopId)!;
    return {
      ...rest,
      cityName: rest.cityName ?? cityFromQueries(own.map((s) => s.searchQuery)),
      center: own.length ? middle(own) : { lat: toStop.lat, lng: toStop.lng },
      arrival: fromId ? { travel: arrivalTravel(stopById.get(fromId)!.route, toStop.route), fromStopId: fromId } : null,
    };
  });
}
