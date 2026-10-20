// functions/src/calendarFeed.ts
/**
 * The private calendar feed (docs/superpowers/specs/2026-10-19-calendar-feed-design.md): the user's trips, days,
 * flights and reservations as iCalendar (RFC 5545). Pure — the HTTPS function loads the data and calls this.
 * Never writes codes, references, barcodes, addresses, notes or other members' bookings.
 */
import { randomBytes } from 'crypto';
import { dayKey, tripDays } from './friendsTraveling';

export type CalTypes = { flights: boolean; stays: boolean; dining: boolean; transit: boolean; tripDays: boolean };
export const DEFAULT_TYPES: CalTypes = { flights: true, stays: true, dining: true, transit: true, tripDays: true };

export type CalPass = { id: string; airline?: string; flightNumber?: string; origin?: string; destination?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string; boardingGroup?: string; showInCalendar?: boolean };
export type CalReservation = { id: string; type: string; title?: string; checkIn?: string; checkOut?: string; time?: string; transitMode?: string; departureLocalTime?: string; showInCalendar?: boolean };
export type CalStop = { id: string; title?: string; startTime?: string | null; endTime?: string | null; order?: number };
export type CalDay = { id: string; dayNumber?: number | null; dateMs: number | null; city?: string | null; stops: CalStop[] };
export type CalTrip = { id: string; title?: string; region?: string | null; startDateMs: number | null; endDateMs: number | null; startDay?: string | null; days: CalDay[] };

const DOMAIN = 'supernovatravel.app';
const WINDOW_MS = 30 * 86_400_000;
const STAYS = new Set(['hotel', 'airbnb', 'rental_car']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + b > limit) { parts.push(current); current = ''; bytes = 0; }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (day: string) => day.replace(/-/g, '');
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function floating(day: string, time: string, plusMinutes = 0): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + plusMinutes;
  const d = addDays(day, Math.floor(total / 1440));
  const mins = total % 1440;
  return `${compactDate(d)}T${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}00`;
}

type Ev = { uid: string; start: string; end: string; summary: string; description?: string; endsAtMs: number };

function allDay(uid: string, first: string, lastInclusive: string, summary: string, description?: string): Ev {
  return {
    uid, summary, description,
    start: `DTSTART;VALUE=DATE:${compactDate(first)}`,
    end: `DTEND;VALUE=DATE:${compactDate(addDays(lastInclusive, 1))}`,
    endsAtMs: Date.parse(`${addDays(lastInclusive, 1)}T00:00:00Z`),
  };
}

function timed(uid: string, day: string, time: string, minutes: number, summary: string, description?: string): Ev {
  return {
    uid, summary, description,
    start: `DTSTART:${floating(day, time)}`,
    end: `DTEND:${floating(day, time, minutes)}`,
    endsAtMs: Date.parse(`${day}T00:00:00Z`) + 86_400_000,
  };
}

function minutesBetween(start: string, end: string | null | undefined, fallback: number): number {
  if (!end || !TIME_RE.test(end)) return fallback;
  const [a, b] = [start, end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return b > a ? b - a : fallback;
}

function flightEvents(passes: CalPass[]): Ev[] {
  const out: Ev[] = [];
  for (const p of passes) {
    const dep = p.departureTime ? Date.parse(p.departureTime) : NaN;
    if (Number.isNaN(dep)) continue;
    const arrRaw = p.arrivalTime ? Date.parse(p.arrivalTime) : NaN;
    const arr = !Number.isNaN(arrRaw) && arrRaw > dep ? arrRaw : dep + 2 * 3_600_000;
    const route = [p.origin, p.destination].filter(Boolean).join(' → ');
    const details = [p.seat && `Seat ${p.seat}`, p.gate && `Gate ${p.gate}`, p.terminal && `Terminal ${p.terminal}`, p.boardingGroup && `Group ${p.boardingGroup}`].filter(Boolean).join('\n');
    out.push({
      uid: `flight-${p.id}@${DOMAIN}`,
      start: `DTSTART:${utc(dep)}`, end: `DTEND:${utc(arr)}`,
      summary: [p.flightNumber || p.airline || 'Flight', route].filter(Boolean).join(' · '),
      description: details || undefined,
      endsAtMs: arr,
    });
  }
  return out;
}

function reservationEvents(rs: CalReservation[], types: CalTypes): Ev[] {
  const out: Ev[] = [];
  for (const r of rs) {
    if (!r.checkIn || !DAY_RE.test(r.checkIn)) continue;
    const uid = `res-${r.id}@${DOMAIN}`;
    const title = r.title?.trim() || 'Reservation';
    if (STAYS.has(r.type)) {
      if (!types.stays) continue;
      const last = r.checkOut && DAY_RE.test(r.checkOut) && r.checkOut > r.checkIn ? addDays(r.checkOut, -1) : r.checkIn;
      const label = r.type === 'rental_car' ? 'Car' : 'Hotel';
      out.push(allDay(uid, r.checkIn, last, `${label}: ${title}`));
    } else if (r.transitMode) {
      if (!types.transit) continue;
      const t = r.departureLocalTime && TIME_RE.test(r.departureLocalTime) ? r.departureLocalTime : null;
      out.push(t ? timed(uid, r.checkIn, t, 60, title) : allDay(uid, r.checkIn, r.checkIn, title));
    } else {
      if (!types.dining) continue;
      const t = r.time && TIME_RE.test(r.time) ? r.time : null;
      out.push(t ? timed(uid, r.checkIn, t, 120, title) : allDay(uid, r.checkIn, r.checkIn, title));
    }
  }
  return out;
}

function tripEvents(trips: CalTrip[]): Ev[] {
  const out: Ev[] = [];
  for (const trip of trips) {
    const like = { startDateMs: trip.startDateMs, endDateMs: trip.endDateMs, startDay: trip.startDay ?? null };
    const span = tripDays(like);
    if (!span) continue;
    const length = Math.round((Date.parse(`${span.end}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
    out.push(allDay(`trip-${trip.id}@${DOMAIN}`, span.start, span.end, trip.title?.trim() || 'Trip',
      [`${length} ${length === 1 ? 'day' : 'days'}`, trip.region].filter(Boolean).join(' · ')));
    for (const d of trip.days) {
      const date = dayKey(like, { dateMs: d.dateMs, destinationIndex: null, dayNumber: d.dayNumber ?? null });
      if (!date) continue;
      const stops = [...d.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      out.push(allDay(`day-${d.id}@${DOMAIN}`, date, date,
        [`Day ${d.dayNumber ?? ''}`.trim(), d.city].filter(Boolean).join(' · '),
        stops.map((s) => s.title?.trim()).filter(Boolean).join('\n') || undefined));
      for (const s of stops) {
        if (!s.startTime || !TIME_RE.test(s.startTime)) continue;
        out.push(timed(`stop-${s.id}@${DOMAIN}`, date, s.startTime, minutesBetween(s.startTime, s.endTime, 60), s.title?.trim() || 'Stop'));
      }
    }
  }
  return out;
}

export function buildCalendar(
  input: { trips: CalTrip[]; passes: CalPass[]; reservations: CalReservation[]; types?: Partial<CalTypes> },
  now: Date,
): string {
  const types = { ...DEFAULT_TYPES, ...(input.types ?? {}) };
  const shown = <T extends { showInCalendar?: boolean }>(xs: T[]) => xs.filter((x) => x.showInCalendar !== false);
  const evs = [
    ...(types.flights ? flightEvents(shown(input.passes)) : []),
    ...reservationEvents(shown(input.reservations), types),
    ...(types.tripDays ? tripEvents(input.trips) : []),
  ].filter((e) => e.endsAtMs >= now.getTime() - WINDOW_MS);
  const stamp = utc(now.getTime());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Galaxie Labs//Supernova//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Supernova trips', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of evs) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, e.start, e.end, `SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** 24 characters a-z0-9; 252 is the largest multiple of 36 under 256, so every character is equally likely. */
export function newFeedToken(random: (n: number) => Buffer = randomBytes): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < 24) {
    for (const b of random(32)) {
      if (b >= 252) continue;
      out += alphabet[b % 36];
      if (out.length === 24) break;
    }
  }
  return out;
}

/** The token in /cal/{token}.ics — exactly 24 of a-z0-9, so nothing else can be looked up. */
export function tokenFromPath(path: string): string | null {
  const m = /^\/cal\/([a-z0-9]{24})(?:\.ics)?$/.exec(path);
  return m ? m[1] : null;
}
