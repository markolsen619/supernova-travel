/** The Today card on Home (spec 2026-10-29): day N of M, today's city, up to 4 stops with the next unvisited, today's booking. */
import { bookingsByDay, type DayBooking } from '@/utils/bookingDays';
import { daysBetween, tripSpan, type SpanTrip } from '@/utils/homeState';
import type { TripBooking } from '@/utils/bookingDays';

export interface TodayStop { id: string; title: string; visited: boolean; next: boolean }
export interface TodayInfo { dayNumber: number; totalDays: number; dayId: string | null; city: string | null; stops: TodayStop[]; nothingPlanned: boolean }
export interface TodayTrip extends SpanTrip {
  destination?: { name?: string | null } | null;
  additionalDestinations?: { name?: string | null }[] | null;
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
  const city = cities[day?.destinationIndex ?? 0]?.name ?? trip.destination?.name ?? null;
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
