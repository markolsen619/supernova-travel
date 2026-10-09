/**
 * A multi-city trip planned city by city (docs/superpowers/specs/2026-10-09-city-route-design.md).
 *
 * Each city has a length in nights; city i arrives on start + Σ nights before
 * it. Day k is the date start + k − 1 and belongs to the city whose
 * [arrive, leave) holds it — the trip's last day (departure) to the last city.
 * So N nights = N + 1 days. Days stay documents: a route change rewrites every
 * day's dayNumber and destinationIndex (`city` here) so everything that reads
 * them, older apps included, keeps working. Pure; dates are `YYYY-MM-DD`.
 */

export interface CityRange {
  index: number;
  nights: number;
  firstDay: number;
  lastDay: number;
  arrive: string | null;
  leave: string | null;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function cityRanges(nights: number[], start: string | null): CityRange[] {
  let before = 0;
  return nights.map((n, index) => {
    const last = index === nights.length - 1;
    const range: CityRange = {
      index,
      nights: n,
      firstDay: before + 1,
      lastDay: before + n + (last ? 1 : 0),
      arrive: start ? addDays(start, before) : null,
      leave: start ? addDays(start, before + n) : null,
    };
    before += n;
    return range;
  });
}

/** Nights for a trip saved before nights existed: its days per city (the last city's last day is departure). */
export function nightsFromDays(dayCities: number[], cityCount: number): number[] {
  const counts = Array.from({ length: cityCount }, (_, i) => dayCities.filter((c) => c === i).length);
  return counts.map((c, i) => Math.max(1, i === cityCount - 1 ? c - 1 : c));
}

export function evenNights(totalNights: number, cityCount: number): number[] {
  const base = Math.floor(totalNights / cityCount);
  const extra = totalNights % cityCount;
  return Array.from({ length: cityCount }, (_, i) => Math.max(1, base + (i < extra ? 1 : 0)));
}

/** Saved nights if every city has them; else from the trip's days; else its dates split evenly; else 1 each. */
export function routeNights(a: { nights: (number | null | undefined)[]; dayCities: number[]; start: string | null; end: string | null }): number[] {
  const n = a.nights.length;
  if (a.nights.every((x) => typeof x === 'number' && x >= 1)) return a.nights as number[];
  if (a.dayCities.length > 0) return nightsFromDays(a.dayCities, n);
  if (a.start && a.end && daysBetween(a.start, a.end) > 0) return evenNights(daysBetween(a.start, a.end), n);
  return Array(n).fill(1);
}

export interface RouteDay { id: string; dayNumber: number; city: number; stops: number }
/** One city of the new route: `from` is its index in the current route (null = new); `absorbs` are removed cities whose days join it. */
export interface RouteEntry { from: number | null; nights: number; absorbs?: number[] }
export interface RoutePlan {
  creates: { dayNumber: number; city: number }[];
  updates: { id: string; dayNumber: number; city: number }[];
  deletes: string[];
  /** Days to be deleted that hold stops — the editor confirms these first. */
  dropsWithStops: RouteDay[];
}

export function planRoute(days: RouteDay[], route: RouteEntry[]): RoutePlan {
  const byCity = (c: number) => days.filter((d) => d.city === c).sort((a, b) => a.dayNumber - b.dayNumber);
  const kept = new Set<string>();
  const plan: RoutePlan = { creates: [], updates: [], deletes: [], dropsWithStops: [] };
  let dayNumber = 1;
  route.forEach((entry, city) => {
    const need = entry.nights + (city === route.length - 1 ? 1 : 0);
    // A removed city's days come first: it sat before this one in the route.
    const pool = [...(entry.absorbs ?? []).flatMap(byCity), ...(entry.from === null ? [] : byCity(entry.from))];
    pool.slice(0, need).forEach((d) => {
      kept.add(d.id);
      if (d.dayNumber !== dayNumber || d.city !== city) plan.updates.push({ id: d.id, dayNumber, city });
      dayNumber++;
    });
    for (let i = pool.length; i < need; i++) plan.creates.push({ dayNumber: dayNumber++, city });
  });
  for (const d of [...days].sort((a, b) => a.dayNumber - b.dayNumber)) {
    if (kept.has(d.id)) continue;
    plan.deletes.push(d.id);
    if (d.stops > 0) plan.dropsWithStops.push(d);
  }
  return plan;
}

export function endDateFor(start: string, totalNights: number): string {
  return addDays(start, totalNights);
}

/** Edit trip changed the end date: the last city's nights take up the difference (at least 1). */
export function absorbEndDateChange(nights: number[], start: string, newEnd: string): number[] {
  const others = nights.slice(0, -1).reduce((s, n) => s + n, 0);
  return [...nights.slice(0, -1), Math.max(1, daysBetween(start, newEnd) - others)];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Which city a booking belongs to: by its city name, else by its date; null if neither places it. */
export function bookingCityIndex(b: { city: string | null | undefined; date: string | null | undefined }, names: string[], ranges: CityRange[]): number | null {
  const city = b.city ? fold(b.city) : '';
  if (city) {
    const hit = names.findIndex((n) => { const f = fold(n); return !!f && (city.includes(f) || f.includes(city)); });
    if (hit >= 0) return hit;
  }
  if (b.date) {
    const last = ranges.length - 1;
    const hit = ranges.findIndex((r, i) => !!r.arrive && !!r.leave && b.date! >= r.arrive && (b.date! < r.leave || (i === last && b.date === r.leave)));
    if (hit >= 0) return hit;
  }
  return null;
}

export function citySummary(a: { days: number; stops: number; staying: boolean }): string {
  const parts = [`${a.days} day${a.days === 1 ? '' : 's'}`];
  if (a.stops > 0) parts.push(`${a.stops} stop${a.stops === 1 ? '' : 's'}`);
  if (a.staying) parts.push('hotel booked');
  if (a.stops === 0 && !a.staying) parts.push('nothing planned yet');
  return parts.join(' · ');
}
