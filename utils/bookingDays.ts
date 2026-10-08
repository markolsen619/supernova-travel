import type { ActivityType, BoardingPass, Reservation } from '@/types';
import { parseCalendarDate, toCalendarDate } from '@/utils/calendarDate';

/**
 * What a reservation is, for icons, labels and placement. Train/bus/ferry
 * tickets are stored as type 'activity' + transitMode (apps before 1.0.3
 * crash on an unknown type), and read back here as 'transit'.
 */
export function reservationKind(r: { type: Reservation['type']; transitMode?: string | null }): Reservation['type'] {
  return r.transitMode ? 'transit' : r.type;
}

/** A trip member's booking you see through the trip (utils/sharedBookings.ts) — read-only. */
export interface SharedBy { uid: string; name: string; tripId: string }
export type TripBooking =
  | { kind: 'boarding_pass'; item: BoardingPass; sharedBy?: SharedBy }
  | { kind: 'reservation'; item: Reservation; sharedBy?: SharedBy };
export type BookingRole = 'flight' | 'check_in' | 'staying' | 'check_out' | 'booked';
export interface DayBooking { booking: TripBooking; role: BookingRole; time: string | null }

const pad = (n: number) => String(n).padStart(2, '0');

/** A flight's day: the date printed on it, else its departure in this device's time (as BoardingPassCard shows it). */
function flightDay(p: BoardingPass): { day: string | null; time: string | null } {
  const t = new Date(p.departureTime);
  const ok = !Number.isNaN(t.getTime());
  return {
    day: p.localDate ?? (ok ? toCalendarDate(t) : null),
    time: ok ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : null,
  };
}

const calendar = (v?: string | null) => {
  const d = v ? parseCalendarDate(v) : null;
  return d ? toCalendarDate(d) : null;
};

export function bookingsByDay(days: { id: string; date: Date | null }[], bookings: TripBooking[]): Record<string, DayBooking[]> {
  const byDate = new Map<string, string>();
  for (const day of days) if (day.date) byDate.set(toCalendarDate(day.date), day.id);
  const out: Record<string, DayBooking[]> = {};
  const put = (date: string | null, entry: DayBooking) => {
    const id = date ? byDate.get(date) : undefined;
    if (id) (out[id] ??= []).push(entry);
  };
  for (const b of bookings) {
    if (b.kind === 'boarding_pass') {
      const { day, time } = flightDay(b.item);
      put(day, { booking: b, role: 'flight', time });
      continue;
    }
    const inDay = calendar(b.item.checkIn);
    const outDay = calendar(b.item.checkOut);
    if (b.item.type !== 'hotel' && b.item.type !== 'airbnb') {
      // A train or ferry sorts by the departure time printed on the ticket.
      put(inDay, { booking: b, role: 'booked', time: reservationKind(b.item) === 'transit' ? (b.item.departureLocalTime ?? null) : null });
      continue;
    }
    if (!inDay) continue;
    put(inDay, { booking: b, role: 'check_in', time: null });
    if (!outDay || outDay <= inDay) continue;
    for (const [date] of byDate) {
      if (date > inDay && date < outDay) put(date, { booking: b, role: 'staying', time: null });
    }
    put(outDay, { booking: b, role: 'check_out', time: null });
  }
  return out;
}

const GENERIC = new Set(['the', 'and', 'of', 'at', 'hotel', 'hostel', 'restaurant', 'ristorante', 'cafe', 'bar',
  'check', 'into', 'in', 'dinner', 'lunch', 'breakfast', 'stay', 'inn', 'house']);
const words = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC.has(t));

const STOP_TYPE: Partial<Record<Reservation['type'], ActivityType>> = {
  hotel: 'hotel', airbnb: 'hotel', restaurant: 'restaurant', activity: 'activity', show: 'activity', transit: 'transport',
};

/** The planned stop is this booking's venue: same kind, and every distinctive word of the booking's name is in the stop's. */
export function bookingMatchesStop(b: TripBooking, stop: { type: ActivityType; title: string; placeName?: string | null }): boolean {
  if (b.kind !== 'reservation' || STOP_TYPE[reservationKind(b.item)] !== stop.type) return false;
  const want = words(b.item.title);
  if (want.length === 0) return false;
  const have = new Set(words(`${stop.title} ${stop.placeName ?? ''}`));
  return want.every((w) => have.has(w));
}

export function bookingLines(d: DayBooking): { title: string; detail: string } {
  const b = d.booking;
  if (b.kind === 'boarding_pass') {
    const p = b.item;
    const route = `${p.flightNumber} · ${p.origin} → ${p.destination}${d.time ? ` · ${d.time}` : ''}`;
    return { title: route, detail: [p.seat ? `Seat ${p.seat}` : null, p.confirmationCode ? `Conf. ${p.confirmationCode}` : null].filter(Boolean).join(' · ') };
  }
  const r = b.item;
  const conf = r.confirmationCode ? `Conf. ${r.confirmationCode}` : '';
  if (d.role === 'check_in') return { title: `Check in · ${r.title}`, detail: conf };
  if (d.role === 'check_out') return { title: `Check out · ${r.title}`, detail: '' };
  if (d.role === 'staying') return { title: `Staying at ${r.title}`, detail: '' };
  if (reservationKind(r) === 'transit') {
    return {
      title: d.time ? `${r.title} · ${d.time}` : r.title,
      detail: [r.seat ? `Seat ${r.seat}` : null, conf || null].filter(Boolean).join(' · '),
    };
  }
  return { title: r.title, detail: conf };
}
