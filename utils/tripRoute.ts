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
/** One city of the new route: `from` is its index in the current route (null = new); `absorbs` / `absorbsAfter` are removed cities whose days join it before / after its own (the city before or after it). */
export interface RouteEntry { from: number | null; nights: number; absorbs?: number[]; absorbsAfter?: number[] }
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
    const pool = [...(entry.absorbs ?? []).flatMap(byCity), ...(entry.from === null ? [] : byCity(entry.from)), ...(entry.absorbsAfter ?? []).flatMap(byCity)];
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

// ── The route editor's operations (components/trip/RouteEditorSheet) ──────────

export interface RouteRow<T> { key: string; from: number | null; nights: number; absorbs: number[]; absorbsAfter: number[]; place: T }
const MAX_NIGHTS = 60;

export function moveRow<T>(rows: RouteRow<T>[], i: number, by: -1 | 1): RouteRow<T>[] {
  const j = i + by;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function setRowNights<T>(rows: RouteRow<T>[], i: number, nights: number): RouteRow<T>[] {
  return rows.map((r, k) => (k === i ? { ...r, nights: Math.min(MAX_NIGHTS, Math.max(1, Math.round(nights))) } : r));
}

/** Remove a city: 'delete' drops its days; 'move' gives its days and nights to the next city (or the one before, if it was last). */
export function removeRow<T>(rows: RouteRow<T>[], i: number, mode: 'delete' | 'move'): RouteRow<T>[] {
  const gone = rows[i];
  const rest = rows.filter((_, k) => k !== i);
  if (mode === 'delete' || rest.length === 0) return rest;
  const carried = [...gone.absorbs, ...(gone.from === null ? [] : [gone.from]), ...gone.absorbsAfter];
  if (i < rows.length - 1) {
    return rest.map((r, k) => (k === i ? { ...r, nights: Math.min(MAX_NIGHTS, r.nights + gone.nights), absorbs: [...carried, ...r.absorbs] } : r));
  }
  return rest.map((r, k) => (k === i - 1 ? { ...r, nights: Math.min(MAX_NIGHTS, r.nights + gone.nights), absorbsAfter: [...r.absorbsAfter, ...carried] } : r));
}

export function addRow<T>(rows: RouteRow<T>[], place: T, key: string): RouteRow<T>[] {
  return [...rows, { key, from: null, nights: 1, absorbs: [], absorbsAfter: [], place }];
}

export function rowsToEntries<T>(rows: RouteRow<T>[]): RouteEntry[] {
  return rows.map((r) => ({ from: r.from, nights: r.nights, absorbs: r.absorbs, absorbsAfter: r.absorbsAfter }));
}

function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function routeDatesLine(start: string | null, nights: number[]): string {
  const total = nights.reduce((s, n) => s + n, 0);
  const n = `${total} night${total === 1 ? '' : 's'}`;
  return start ? `${shortDate(start)} – ${shortDate(endDateFor(start, total))} · ${n}` : `${n} · no dates yet`;
}

/** The confirm before a route save deletes days that hold stops (`names` = the current route). */
export function dropsWarning(drops: RouteDay[], names: string[]): string {
  const each = drops.map((d) => `Day ${d.dayNumber} in ${names[d.city] ?? 'this trip'} (${d.stops} stop${d.stops === 1 ? '' : 's'})`);
  const list = each.length > 1 ? `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}` : each[0];
  return `${list} will be deleted with everything on them.`;
}
