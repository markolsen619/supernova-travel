import type { BoardingPass, Reservation } from '@/types';
import type { TripBooking } from '@/utils/bookingDays';
import type { TripSummary } from '@/utils/walletLink';
import { parseCalendarDate, toCalendarDate } from '@/utils/calendarDate';

export interface TripSection {
  trip: TripSummary;
  /** That trip's bookings, earliest first. */
  items: TripBooking[];
}

export interface WalletByTrip {
  /** Trips not yet over, soonest first; Dates TBD trips last. Empty trips included. */
  upcoming: TripSection[];
  /** Trips that have ended (with or without bookings), most recent first. */
  past: TripSection[];
  /** Bookings on no trip — or on a trip you no longer have. */
  unlinked: TripBooking[];
}

/** The calendar day a booking happens on, `YYYY-MM-DD`, or null when it has none. */
export function bookingDay(b: TripBooking): string | null {
  if (b.kind === 'boarding_pass') {
    if (b.item.localDate) return b.item.localDate;
    const t = new Date(b.item.departureTime);
    return Number.isNaN(t.getTime()) ? null : toCalendarDate(t);
  }
  const d = b.item.checkIn ? parseCalendarDate(b.item.checkIn) : null;
  return d ? toCalendarDate(d) : null;
}

const byDay = (a: TripBooking, b: TripBooking) => (bookingDay(a) ?? '9999').localeCompare(bookingDay(b) ?? '9999');

/** The wallet grouped by trip (Pro "By trip" view). `today` is `YYYY-MM-DD`. */
export function walletByTrip(
  trips: TripSummary[],
  passes: BoardingPass[],
  reservations: Reservation[],
  today: string,
  /** Other members' bookings shared with your trips (utils/sharedBookings.ts). */
  shared: TripBooking[] = [],
): WalletByTrip {
  const all: TripBooking[] = [
    ...passes.map((item) => ({ kind: 'boarding_pass' as const, item })),
    ...reservations.map((item) => ({ kind: 'reservation' as const, item })),
  ];
  const byTrip = new Map<string, TripBooking[]>();
  const unlinked: TripBooking[] = [];
  const known = new Set(trips.map((t) => t.tripId));
  for (const b of all) {
    const tripId = b.item.tripId;
    if (tripId && known.has(tripId)) (byTrip.get(tripId) ?? byTrip.set(tripId, []).get(tripId)!).push(b);
    else unlinked.push(b);
  }
  for (const b of shared) {
    const tripId = b.sharedBy?.tripId;
    if (tripId && known.has(tripId)) (byTrip.get(tripId) ?? byTrip.set(tripId, []).get(tripId)!).push(b);
  }
  const sections = trips.map((trip) => ({ trip, items: (byTrip.get(trip.tripId) ?? []).sort(byDay) }));
  const isPast = (t: TripSummary) => !!t.end && t.end < today;
  return {
    upcoming: sections
      .filter((s) => !isPast(s.trip))
      .sort((a, b) => (a.trip.start ?? '9999').localeCompare(b.trip.start ?? '9999')),
    past: sections
      .filter((s) => isPast(s.trip))
      .sort((a, b) => (b.trip.start ?? '').localeCompare(a.trip.start ?? '')),
    unlinked: unlinked.sort(byDay),
  };
}
