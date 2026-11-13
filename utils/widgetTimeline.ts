/**
 * The Home Screen widget's content (spec 2026-11-12), worked out ahead for both platforms: what to show at a moment
 * (flight day → trip day → trip ahead → nothing) and the next 48 h of moments where that changes. Times are the
 * phone's local clock. Pure.
 */
export type WidgetStop = { title: string; time: string | null; visited: boolean };
export type WidgetInput = {
  trip: { id: string; title: string; start: string | null; end: string | null; coverKey: string | null; days: { date: string; city: string; stops: WidgetStop[]; weather: string | null }[] } | null;
  flight: { id: string; flightNumber: string; route: string; departMs: number; departLocal: string; gate: string | null; status: string | null } | null;
  wishCity: string | null;
};
export type WidgetView = { kind: 'flight' | 'trip' | 'countdown' | 'empty'; eyebrow: string; title: string; detail: string | null; second: string | null; url: string; imageKey: string | null };

const H = 3_600_000;
/** How far ahead the widget's entries run. */
export const TIMELINE_DAYS = 14;
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localHM = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Local midnight that ends `day` (YYYY-MM-DD). */
const midnightAfter = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d + 1).getTime(); };
const at = (day: string, hm: string) => { const [y, m, d] = day.split('-').map(Number); const [hh, mm] = hm.split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };

/** Today's next stop: the first whose time is ahead; an untimed stop counts once the timed stop before it has passed. */
function nextStops(stops: WidgetStop[], nowHM: string): WidgetStop[] {
  const anyTime = stops.some((s) => s.time);
  if (!anyTime) return stops.filter((s) => !s.visited);
  let lastPassed = -1;
  stops.forEach((s, i) => { if (s.time && s.time <= nowHM) lastPassed = i; });
  // A stop already ticked off is never "next" (final review).
  return stops.slice(lastPassed + 1).filter((s) => !s.visited);
}

export function widgetView(input: WidgetInput, nowMs: number): WidgetView {
  const f = input.flight;
  if (f && nowMs >= f.departMs - 6 * H && nowMs < f.departMs + H) {
    return { kind: 'flight', eyebrow: `FLIGHT ${localDay(f.departMs) === localDay(nowMs) ? 'TODAY' : 'TOMORROW'} · ${f.route}`, title: f.flightNumber, detail: `Departs ${f.departLocal}${f.gate ? ` · Gate ${f.gate}` : ''}`, second: f.status, url: `supernova://boarding-pass/${f.id}`, imageKey: null };
  }
  const t = input.trip;
  const today = localDay(nowMs);
  if (t && t.start && t.start <= today && (t.end ?? t.start) >= today) {
    const i = t.days.findIndex((d) => d.date === today);
    const url = `supernova://trip/${t.id}`;
    const dayNo = daysBetween(t.start, today) + 1;
    if (i < 0) return { kind: 'trip', eyebrow: `DAY ${dayNo}`, title: t.title, detail: null, second: null, url, imageKey: t.coverKey };
    const day = t.days[i];
    const eyebrow = `DAY ${dayNo} · ${day.city.toUpperCase()}`;
    const left = nextStops(day.stops, localHM(nowMs));
    if (left.length > 0) {
      return { kind: 'trip', eyebrow, title: left[0].title, detail: left[0].time, second: left[1] ? `Then ${left[1].title}` : day.weather, url, imageKey: null };
    }
    const tomorrow = t.days[i + 1]?.stops[0];
    return { kind: 'trip', eyebrow, title: tomorrow ? `Tomorrow: ${tomorrow.title}` : 'Done for today', detail: tomorrow?.time ?? null, second: day.weather, url, imageKey: null };
  }
  if (t && t.start && t.start > today) {
    const n = daysBetween(today, t.start);
    return { kind: 'countdown', eyebrow: n === 1 ? 'TOMORROW' : `${n} DAYS`, title: t.title, detail: null, second: null, url: `supernova://trip/${t.id}`, imageKey: t.coverKey };
  }
  return { kind: 'empty', eyebrow: 'SUPERNOVA', title: 'Plan your next trip', detail: input.wishCity ? `${input.wishCity} is on your wish list` : null, second: null, url: 'supernova://create', imageKey: null };
}

const same = (a: WidgetView, b: WidgetView) => JSON.stringify(a) === JSON.stringify(b);

export function widgetTimeline(input: WidgetInput, nowMs: number): { at: number; view: WidgetView }[] {
  // Stops and flights are known for the next 48 h; midnights run two weeks ahead, so a countdown keeps counting and a
  // trip's day number moves on even when the app isn't opened (final review: after 48 h the widget froze).
  const end = nowMs + TIMELINE_DAYS * 24 * H;
  const points = new Set<number>([nowMs]);
  let day = localDay(nowMs);
  for (let k = 0; k <= TIMELINE_DAYS; k++) { points.add(midnightAfter(day)); day = localDay(midnightAfter(day)); }
  for (const d of input.trip?.days ?? []) for (const s of d.stops) if (s.time) points.add(at(d.date, s.time) + 60_000);
  if (input.flight) { points.add(input.flight.departMs - 6 * H); points.add(input.flight.departMs + H); }
  const out: { at: number; view: WidgetView }[] = [];
  for (const p of [...points].filter((p) => p >= nowMs && p <= end).sort((a, b) => a - b)) {
    const view = widgetView(input, p);
    if (out.length === 0 || !same(out[out.length - 1].view, view)) out.push({ at: p, view });
  }
  return out;
}

/** The flight the widget should know about: the soonest not cancelled/completed, departing (with any delay) between an hour ago and 48 h ahead. */
export function widgetFlightPass<P extends { departureTime: string; status: string; delayMinutes?: number | null }>(passes: P[], nowMs: number): P | null {
  return passes
    .filter((p) => p.status !== 'cancelled' && p.status !== 'completed')
    .map((p) => ({ p, ms: Date.parse(p.departureTime) + Math.max(0, p.delayMinutes ?? 0) * 60_000 }))
    .filter(({ ms }) => Number.isFinite(ms) && ms > nowMs - H && ms <= nowMs + 48 * H)
    .sort((a, b) => a.ms - b.ms)[0]?.p ?? null;
}

/** The view in effect at a moment: the last entry that has started, else the first; null when nothing is saved. */
export function entryAt(entries: { at: number; view: WidgetView }[], nowMs: number): WidgetView | null {
  if (entries.length === 0) return null;
  let current = entries[0];
  for (const e of entries) if (e.at <= nowMs) current = e;
  return current.view;
}
