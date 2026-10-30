/** The Today card on Home (spec 2026-10-29): day N of M, today's city, up to 4 stops with the next unvisited, today's booking. */
import { bookingsByDay, type DayBooking, type TripBooking } from '@/utils/bookingDays';
import { daysBetween, tripSpan, type SpanTrip } from '@/utils/homeState';
import { cityRanges, routeNights } from '@/utils/tripRoute';

export interface TodayStop { id: string; title: string; visited: boolean; next: boolean }
export interface TodayInfo { dayNumber: number; totalDays: number; dayId: string | null; city: string | null; stops: TodayStop[]; nothingPlanned: boolean }
export interface TodayTrip extends SpanTrip {
  destination?: { name?: string | null; nights?: number | null } | null;
  additionalDestinations?: { name?: string | null; nights?: number | null }[] | null;
  days: { id: string; dayNumber: number; destinationIndex?: number | null; activities: { id: string; title: string; order: number; visited?: boolean }[] }[];
}

const MAX_STOPS = 4;

export function todayInfo(trip: TodayTrip, today: string): TodayInfo | null {
  const { start, end } = tripSpan(trip);
  if (!start || !end || today < start || today > end) return null;
  const dayNumber = daysBetween(start, today) + 1;
  const totalDays = daysBetween(start, end) + 1;
  const day = trip.days.find((d) => d.dayNumber === dayNumber) ?? null;
  const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
  const city = cities[todayCityIndex(trip, dayNumber, start, end)]?.name ?? trip.destination?.name ?? null;
  const ordered = [...(day?.activities ?? [])].sort((a, b) => a.order - b.order);
  const nextIdx = ordered.findIndex((a) => !a.visited);
  const from = ordered.length <= MAX_STOPS ? 0 : Math.max(0, Math.min((nextIdx < 0 ? ordered.length : nextIdx) - 1, ordered.length - MAX_STOPS));
  const stops = ordered.slice(from, from + MAX_STOPS).map((a) => ({ id: a.id, title: a.title, visited: a.visited === true, next: a.id === ordered[nextIdx]?.id }));
  return { dayNumber, totalDays, dayId: day?.id ?? null, city, stops, nothingPlanned: ordered.length === 0 };
}

export function countdownLabel(start: string, today: string): string {
  const n = daysBetween(today, start);
  return n === 1 ? 'TOMORROW' : `IN ${n} DAYS`;
}

const ROLE_RANK: Record<string, number> = { flight: 0, booked: 1, check_in: 2, check_out: 3, staying: 4 };

/** The one booking for today's card: a flight first, then a ticket or table, then hotel moves. */
export function todaysBooking(bookings: TripBooking[], today: string): DayBooking | null {
  const [y, m, d] = today.split('-').map(Number);
  const list = bookingsByDay([{ id: 'today', date: new Date(y, m - 1, d, 12) }], bookings).today ?? [];
  return [...list].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))[0] ?? null;
}

/**
 * Which city of the route today is in (final review): the day's own saved city when it has one, else the route's
 * nights per city (saved nights, else from the days, else the dates split evenly — utils/tripRoute), and past the
 * last city, the last one. AI trips store no destinationIndex, so a Lisbon → Porto trip said "Lisbon" in Porto.
 */
export function todayCityIndex(trip: TodayTrip, dayNumber: number, start: string, end: string): number {
  const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
  const n = cities.length;
  if (n <= 1) return 0;
  const own = trip.days.find((d) => d.dayNumber === dayNumber)?.destinationIndex;
  if (typeof own === 'number' && own >= 0 && own < n) return own;
  const ordered = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const dayCities = ordered.every((d) => typeof d.destinationIndex === 'number') ? ordered.map((d) => d.destinationIndex as number) : [];
  const nights = routeNights({ nights: cities.map((c) => c?.nights ?? null), dayCities, start, end });
  const range = cityRanges(nights, null).find((r) => dayNumber >= r.firstDay && dayNumber <= r.lastDay);
  return range ? range.index : n - 1;
}
