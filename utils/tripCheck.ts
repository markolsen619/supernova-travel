/**
 * What Nova points out when it opens (docs/superpowers/specs/2026-10-16-nova-phase2-design.md §2):
 * checked on the phone, no AI call, so it's free and never uses a message. Pure.
 */
import { optimizeDay, routeKm, type PlaceStop } from '@/utils/routePlacement';
import { destinationAt } from '@/utils/groundingContext';
import { haversineMeters } from '@/utils/tripRoutes';
import type { TripActivity, TripStatus, TripWithDays } from '@/types';
import type { TripBooking } from '@/utils/bookingDays';
import type { AgentOp } from '@/types/agent';
import { displayStatus } from '@/utils/tripStatus';

export type Finding =
  | { kind: 'zigzag'; dayId: string; dayNumber: number; savedKm: number }
  | { kind: 'far'; dayId: string; dayNumber: number; stopTitle: string; km: number; city: string }
  | { kind: 'meals'; dayId: string; dayNumber: number; stopIds: string[] }
  | { kind: 'clash'; dayId: string; dayNumber: number; stopTitle: string; booking: string };

export interface CheckBooking { name: string; date: string | null; start: string | null; end: string | null; kind: string }

const ZIGZAG_RATIO = 1.4;
const ZIGZAG_MIN_KM = 3;
const FAR_KM = 25;
const LUNCH = /\blunch\b/i;
const DINNER = /\bdinner\b/i;
const mins = (t: string | null | undefined) => (t && /^\d{2}:\d{2}/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const asStop = (a: TripActivity): PlaceStop => ({
  id: a.id, lat: a.lat ?? null, lng: a.lng ?? null, type: a.type, title: a.title, startTime: a.startTime ?? null,
  fixed: !!(a as { fromBooking?: unknown }).fromBooking,
});
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function tripCheck(trip: TripWithDays, bookings: CheckBooking[] = [], startDay: string | null = null): Finding[] {
  const clash: Finding[] = [];
  const zig: (Finding & { kind: 'zigzag' })[] = [];
  const far: Finding[] = [];
  const meals: Finding[] = [];
  for (const d of trip.days) {
    const stops = [...d.activities].sort((a, b) => a.order - b.order);
    const placed = stops.filter((a) => a.lat != null && a.lng != null);
    if (placed.length >= 3) {
      const before = routeKm(stops.map(asStop));
      const after = routeKm(optimizeDay(stops.map(asStop)));
      if (before >= ZIGZAG_RATIO * after && before - after >= ZIGZAG_MIN_KM) zig.push({ kind: 'zigzag', dayId: d.id, dayNumber: d.dayNumber, savedKm: before - after });
    }
    const dest = destinationAt(trip, d.destinationIndex ?? 0);
    if (dest.lat != null && dest.lng != null) {
      const centre = { lat: dest.lat, lng: dest.lng };
      const worst = placed.map((a) => ({ a, km: haversineMeters(centre, { lat: a.lat!, lng: a.lng! }) / 1000 })).sort((x, y) => y.km - x.km)[0];
      if (worst && worst.km > FAR_KM) far.push({ kind: 'far', dayId: d.id, dayNumber: d.dayNumber, stopTitle: worst.a.title, km: worst.km, city: dest.name });
    }
    const dinnerAt = stops.findIndex((a) => DINNER.test(a.title));
    const lunchAt = stops.findIndex((a, i) => i > dinnerAt && LUNCH.test(a.title));
    if (dinnerAt >= 0 && lunchAt > dinnerAt) {
      const ids = stops.map((a) => a.id);
      const [dinner] = ids.splice(dinnerAt, 1);
      ids.splice(ids.indexOf(stops[lunchAt].id) + 1, 0, dinner);
      meals.push({ kind: 'meals', dayId: d.id, dayNumber: d.dayNumber, stopIds: ids });
    }
    if (startDay && bookings.length) {
      const date = addDays(startDay, d.dayNumber - 1);
      for (const b of bookings.filter((x) => x.date === date && (x.kind === 'flight' || x.kind === 'transit'))) {
        const s = mins(b.start);
        const e = mins(b.end) ?? (s != null ? s + 120 : null);
        const hit = s != null && e != null ? stops.find((a) => { const t = mins(a.startTime); return t != null && t >= s && t < e; }) : undefined;
        if (hit) clash.push({ kind: 'clash', dayId: d.id, dayNumber: d.dayNumber, stopTitle: hit.title, booking: b.name });
      }
    }
  }
  zig.sort((a, b) => b.savedKm - a.savedKm);
  return [...clash, ...zig, ...far, ...meals].slice(0, 2);
}

/** The line Nova says, the button's verb, and the fix: a free local proposal or a prepared message. */
export function findingText(f: Finding): { text: string; action: string; local: AgentOp[] | null; prompt: string | null } {
  switch (f.kind) {
    case 'zigzag':
      return { text: `Day ${f.dayNumber} crosses town — reordering it saves about ${Math.round(f.savedKm)} km.`, action: `Reorder day ${f.dayNumber}`, local: [{ kind: 'trip.optimizeDay', dayId: f.dayId }], prompt: null };
    case 'far':
      return { text: `${f.stopTitle} is ${Math.round(f.km)} km from the rest of ${f.city}.`, action: 'Find one nearby', local: null, prompt: `Find something near the rest of day ${f.dayNumber} instead of ${f.stopTitle}` };
    case 'meals':
      return { text: `Day ${f.dayNumber} has dinner before lunch.`, action: 'Swap them', local: [{ kind: 'trip.reorderDay', dayId: f.dayId, stopIds: f.stopIds }], prompt: null };
    case 'clash':
      return { text: `${f.stopTitle} on day ${f.dayNumber} overlaps your ${f.booking}.`, action: 'Move it', local: null, prompt: `${f.stopTitle} is during my ${f.booking} on day ${f.dayNumber}, move it` };
  }
}

export function greeting(firstName: string | null, findings: Finding[]): string {
  const hi = firstName ? `Hi ${firstName}.` : 'Hi.';
  return findings.length ? `${hi} ${findingText(findings[0]).text}` : `${hi} Your trip looks good. Ask me for anything you'd like to change.`;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Device-local "HH:MM" and day of an ISO instant, as BoardingPassCard shows it. */
function local(iso: string | undefined): { day: string; hhmm: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hhmm: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** The trip's flights and trains as clash input; other bookings never block a stop. */
export function checkBookings(list: TripBooking[]): CheckBooking[] {
  const out: CheckBooking[] = [];
  for (const b of list) {
    if (b.kind === 'boarding_pass') {
      const dep = local(b.item.departureTime);
      const arr = local(b.item.arrivalTime);
      if (!dep) continue;
      out.push({ name: [b.item.airline, b.item.flightNumber].filter(Boolean).join(' '), date: b.item.localDate ?? dep.day, start: dep.hhmm, end: arr?.hhmm ?? null, kind: 'flight' });
    } else if (b.item.transitMode) {
      out.push({ name: b.item.title, date: b.item.checkIn ?? null, start: b.item.departureLocalTime ?? b.item.time ?? null, end: b.item.arrivalLocalTime ?? null, kind: 'transit' });
    }
  }
  return out;
}

/** The free trip check fixes plans; a trip that has ended has nothing to fix (spec 2026-10-25-past-trips-from-photos). */
export function shouldRunTripCheck(trip: { status: TripStatus; startDate: Date | null; endDate: Date | null }, now: Date): boolean {
  return displayStatus(trip, now) !== 'completed';
}

