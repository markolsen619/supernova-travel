/**
 * The trip as the agent sees it (docs/superpowers/specs/2026-10-14-trip-agent-design.md):
 * compact text with short labels (d1, s4, c2) in place of Firestore ids — fewer
 * tokens, and the model can't invent an id. Pure: no firebase-admin.
 */
export interface CtxStop { id: string; title: string; type: string; startTime: string | null; placed: boolean; order: number; lat?: number | null; lng?: number | null }
export interface CtxDay { id: string; dayNumber: number; city: number; stops: CtxStop[] }
export interface CtxCity { name: string; nights: number | null }
export interface CtxBooking {
  kind: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transit' | 'car'; name: string; date: string | null; time: string | null; shared: boolean;
  /** Own wallet bookings only (wallet.v1): label b1…, and what the model may know about them — never the code itself. */
  label?: string; linked?: boolean; hasStop?: boolean; hasCode?: boolean; ref?: { kind: 'boarding_pass' | 'reservation'; id: string };
}
export interface CtxTopPlace { city: number; name: string; type: string }
export interface CtxPacking { id: string; label: string; checked: boolean }
export interface TripCtxInput { title: string; startDay: string | null; today: string; cities: CtxCity[]; days: CtxDay[]; bookings: CtxBooking[]; topPlaces: CtxTopPlace[]; packing?: CtxPacking[]; visibility?: string }
export interface LabelMap {
  days: Record<string, string>;
  stops: Record<string, { dayId: string; stopId: string }>;
  dayStops: Record<string, string[]>;
  cityCount: number;
  /** k1… → packing item id. */
  packing: Record<string, string>;
  /** b1… → the caller's own wallet booking. */
  bookings: Record<string, { kind: 'boarding_pass' | 'reservation'; id: string; linked: boolean }>;
}

export const CONTEXT_BUDGET_CHARS = 12_000;
const TITLE_MAX = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Great-circle km: the model judges nearness from these numbers, never from memory (phase 2 spec §3). */
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toR(b.lat - a.lat) / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(toR(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const fmtKm = (k: number) => (k < 10 ? k.toFixed(1) : String(Math.round(k)));

export function buildTripContext(input: TripCtxInput, budget: number = CONTEXT_BUDGET_CHARS): { text: string; labels: LabelMap } {
  const labels: LabelMap = { days: {}, stops: {}, dayStops: {}, cityCount: input.cities.length, packing: {}, bookings: {} };
  const days = [...input.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const start = input.startDay && DAY_RE.test(input.startDay) ? input.startDay : null;

  // Labels for everything first, so trimmed lines still map back.
  let n = 0;
  const dayLines: { full: string; short: string }[] = [];
  for (const d of days) {
    const dl = `d${d.dayNumber}`;
    labels.days[dl] = d.id;
    const stops = [...d.stops].sort((a, b) => a.order - b.order);
    labels.dayStops[d.id] = stops.map((s) => s.id);
    const city = input.cities[d.city]?.name ?? input.cities[0]?.name ?? '';
    let prev: { label: string; lat: number; lng: number } | null = null;
    let route = 0;
    let placedCount = 0;
    const parts = stops.map((s) => {
      n += 1;
      const label = `s${n}`;
      labels.stops[label] = { dayId: d.id, stopId: s.id };
      const point = s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null;
      let dist = '';
      if (point) {
        placedCount += 1;
        if (prev) {
          const k = kmBetween(prev, point);
          route += k;
          dist = ` (${fmtKm(k)} km from ${prev.label})`;
        }
        prev = { label, ...point };
      }
      // Callers without coordinates (lat undefined) keep the old placed flag.
      const placed = point != null || (s.lat === undefined && s.placed);
      return `${label} ${clip(s.title, TITLE_MAX)} [${fixMeta(s.type, s.startTime, placed)}]${dist}`;
    });
    const routeTag = placedCount >= 2 ? ` · route ${Math.round(route)} km` : '';
    const head = (start ? `${dl} ${addDays(start, d.dayNumber - 1)} ${city}` : `${dl} ${city}`) + routeTag;
    const first = n - stops.length + 1;
    dayLines.push({
      full: `${head}: ${parts.length ? parts.join(' · ') : '(no stops)'}`,
      short: `${head}: ${stops.length} stops (s${first}–s${n})`,
    });
  }

  const header = [
    `TODAY ${input.today}`,
    `TRIP "${clip(input.title, 80)}" ${start ? `starts ${start}` : 'dates not set'}`,
    `CITIES: ${input.cities.map((c, i) => `c${i + 1} ${c.name}${c.nights != null ? ` ${c.nights}n` : ''}`).join(' | ')}`,
  ].join('\n');
  const bookingText = (b: CtxBooking) => {
    const base = [b.label, b.kind, b.name, b.date, b.time].filter(Boolean).join(' ');
    if (b.shared) return `${base} (shared)`;
    if (!b.label) return base;
    const notes = [b.linked ? 'linked' : 'not linked', b.hasStop ? 'on the trip' : 'not on the trip yet', ...(b.hasCode ? ['has code'] : [])];
    return `${base} (${notes.join(', ')})`;
  };
  input.bookings.forEach((b) => { if (b.label && b.ref) labels.bookings[b.label] = { ...b.ref, linked: !!b.linked }; });
  const bookings = input.bookings.length ? `BOOKINGS: ${input.bookings.map(bookingText).join(' | ')}` : 'BOOKINGS: none';
  const packingItems = (input.packing ?? []).slice(0, 40);
  packingItems.forEach((p, i) => { labels.packing[`k${i + 1}`] = p.id; });
  const packing = packingItems.length
    ? `PACKING: ${packingItems.map((p, i) => `k${i + 1} ${clip(p.label, 40)} [${p.checked ? 'x' : ' '}]`).join(' · ')}`
    : '';
  const details = input.visibility ? `TRIP DETAILS: visibility ${input.visibility}` : '';
  const favourites = input.topPlaces.length
    ? `COMMUNITY FAVOURITES: ${groupTop(input.topPlaces)}`
    : '';

  // Trim: far days (from the end) drop to one-line summaries until it fits.
  const lines = dayLines.map((d) => d.full);
  const assemble = () => [header, details, ...lines, bookings, packing, favourites].filter(Boolean).join('\n');
  for (let i = lines.length - 1; i >= 0 && assemble().length > budget; i--) lines[i] = dayLines[i].short;
  let text = assemble();
  if (text.length > budget) text = text.slice(0, budget);
  return { text, labels };
}

function fixMeta(type: string, time: string | null, placed: boolean): string {
  const head = time ? `${type} ${time}` : type;
  return placed ? head : `${head}, no location`;
}

function groupTop(places: CtxTopPlace[]): string {
  const by = new Map<number, string[]>();
  for (const p of places) by.set(p.city, [...(by.get(p.city) ?? []), `${p.name} (${p.type})`]);
  return [...by.entries()].map(([c, list]) => `c${c + 1}: ${list.join(', ')}`).join(' | ');
}

/** A wallet booking reduced to what the model may see: type, name, date, time. Never codes, addresses, barcodes. */
export function bookingForContext(kind: 'boarding_pass' | 'reservation', d: Record<string, unknown>, shared: boolean): CtxBooking | null {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (kind === 'boarding_pass') {
    const name = [str(d.airline), str(d.flightNumber)].filter(Boolean).join(' ');
    if (!name) return null;
    const route = str(d.origin) && str(d.destination) ? ` ${str(d.origin)}→${str(d.destination)}` : '';
    const dep = str(d.departureTime);
    return { kind: 'flight', name: `${name}${route}`, date: str(d.localDate) ?? (dep ? dep.slice(0, 10) : null), time: dep && dep.length >= 16 ? dep.slice(11, 16) : null, shared };
  }
  const title = str(d.title);
  if (!title) return null;
  const type = str(d.type);
  const k: CtxBooking['kind'] =
    type === 'hotel' || type === 'airbnb' ? 'hotel'
      : type === 'rental_car' ? 'car'
        : type === 'restaurant' ? 'restaurant'
          : str(d.transitMode) ? 'transit' : 'activity';
  const checkIn = str(d.checkIn);
  return { kind: k, name: clip(title, TITLE_MAX), date: checkIn ? checkIn.slice(0, 10) : null, time: str(d.time), shared };
}
