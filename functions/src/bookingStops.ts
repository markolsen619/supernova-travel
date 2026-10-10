/**
 * A wallet booking linked to a trip appears in that day's itinerary as a stop
 * (2026-10-09): restaurants, tours and shows as places, trains / buses / ferries
 * as transport, flights as flights, a hotel as its check-in. If the day already
 * has a stop for the place, the booking attaches to it instead. The stop's id is
 * fixed per booking, so a repeated write never adds a second one. Pure — no
 * firebase-admin — so it is unit-tested; bookingStopFunctions.ts applies it.
 */
export type BookingKind = 'boarding_pass' | 'reservation';

export function bookingStopId(kind: BookingKind, id: string): string {
  return `booking_${kind}_${id}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** The booking's day as printed: a flight's local departure day, else its date; a reservation's (check-in) date. */
export function bookingDate(kind: BookingKind, b: Record<string, any>): string | null {
  const day = kind === 'boarding_pass'
    ? (typeof b.localDate === 'string' && DAY.test(b.localDate) ? b.localDate : (typeof b.departureTime === 'string' ? b.departureTime.slice(0, 10) : null))
    : (typeof b.checkIn === 'string' ? b.checkIn : null);
  return day && DAY.test(day) ? day : null;
}

/** Which trip day (1-based dayNumber) the booking falls on, or null when it isn't inside the trip. */
export function bookingDayNumber(kind: BookingKind, b: Record<string, any>, tripStart: string | null, dayCount = Infinity): number | null {
  const date = bookingDate(kind, b);
  if (!date || !tripStart) return null;
  const n = daysBetween(tripStart, date) + 1;
  return n >= 1 && n <= dayCount ? n : null;
}

function reservationStopType(b: Record<string, any>): 'restaurant' | 'activity' | 'transport' | 'hotel' {
  if (b.transitMode) return 'transport';
  if (b.type === 'hotel' || b.type === 'airbnb') return 'hotel';
  if (b.type === 'restaurant') return 'restaurant';
  if (b.type === 'rental_car') return 'transport';
  return 'activity';
}

/** The new stop's fields — the same shape the app writes for a stop added by hand. */
export function stopFromBooking(kind: BookingKind, id: string, b: Record<string, any>, city: string | null): Record<string, unknown> {
  let type: string;
  let title: string;
  let searchQuery: string | null = null;
  if (kind === 'boarding_pass') {
    type = 'flight';
    title = [b.flightNumber, b.origin && b.destination ? `${b.origin} → ${b.destination}` : null].filter(Boolean).join(' ') || 'Flight';
  } else {
    type = reservationStopType(b);
    const name = String(b.title ?? 'Booking').trim();
    title = type === 'hotel' ? `Check in · ${name}` : name;
    // Places are looked up so they land on the map, by name and city. Never the booking's address:
    // a stop is readable by everyone who can see the trip (bookingRef too — see below).
    if (type !== 'transport') searchQuery = city ? `${name}, ${city}` : name;
  }
  return {
    type,
    title,
    startTime: null, // shown from the booking (utils/stopTime), so it follows the booking if that changes
    endTime: null,
    notes: '',
    visited: false,
    visitedAt: null,
    placeId: null,
    address: null,
    lat: null,
    lng: null,
    durationMinutes: null,
    // Never the confirmation code: a flight's is the airline record locator, which manages the booking, and
    // a stop is readable by anyone who can see the trip. Members read it from trips/{id}/bookings.
    bookingRef: null,
    cost: null,
    currency: null,
    mediaUrls: [],
    searchQuery,
    groundingFailedAt: null,
    // A booking's name is the place's real name: never renamed after a lookup result.
    titleSource: 'user',
    fromBooking: { kind, id, ownerUid: String(b.ownerUid ?? ''), auto: true },
  };
}

const GENERIC = new Set(['the', 'and', 'of', 'at', 'hotel', 'hostel', 'restaurant', 'ristorante', 'cafe', 'bar',
  'check', 'into', 'in', 'dinner', 'lunch', 'breakfast', 'stay', 'inn', 'house']);
const words = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC.has(t));

/**
 * A stop already planned for this booking's place on that day (same kind, every
 * distinctive word of the booking in the stop) — the same rule as the app's
 * bookingMatchesStop. Flights never match a planned stop.
 */
export function existingStopFor(kind: BookingKind, b: Record<string, any>, stops: { id: string; type: string; title: string; placeName?: string | null }[]): string | null {
  if (kind !== 'reservation') return null;
  const type = reservationStopType(b);
  const want = words(String(b.title ?? ''));
  if (want.length === 0) return null;
  const hit = stops.find((s) => {
    if (s.type !== type) return false;
    const have = new Set(words(`${s.title} ${s.placeName ?? ''}`));
    return want.every((w) => have.has(w));
  });
  return hit ? hit.id : null;
}

/**
 * A trip date as its calendar day. The app saves trip dates at the traveller's
 * local midnight, which in UTC is the previous evening east of Greenwich and
 * the morning west of it; half a day forward lands on the right day for every
 * zone from UTC−12 to UTC+11.
 */
export function tripCalendarDay(millis: number): string {
  return new Date(millis + 12 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Which bookings become stops where (decided 2026-10-09): a stop is readable by
 * everyone who can see the trip, so restaurants, tours and shows (places you'd
 * add yourself) appear on every trip, but flights, trains and hotels — where
 * you'll be, and when — only on private trips. Elsewhere those stay members-only
 * (the trip's shared bookings).
 */
export function bookingStopAllowed(kind: BookingKind, b: Record<string, any>, visibility: unknown): boolean {
  if (visibility === 'private') return true;
  if (kind !== 'reservation') return false;
  const type = reservationStopType(b);
  return type === 'restaurant' || type === 'activity';
}

/** The trip's first day: the calendar day the app saves alongside the date (1.0.4+), else read from the timestamp. */
export function tripStartDay(trip: { startDay?: unknown; startDate?: { toMillis?: () => number } | null }): string | null {
  const fromStamp = trip.startDate?.toMillis ? tripCalendarDay(trip.startDate.toMillis()) : null;
  // The saved day is exact, but only while it still agrees with the date (within the one-day time-zone
  // slack): apps before 1.0.4 change startDate without touching startDay.
  if (typeof trip.startDay === 'string' && DAY.test(trip.startDay) && (!fromStamp || Math.abs(daysBetween(fromStamp, trip.startDay)) <= 1)) {
    return trip.startDay;
  }
  return fromStamp;
}
