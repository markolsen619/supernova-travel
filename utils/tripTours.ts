/**
 * Tours and tickets on your trips (owner, 2026-11-08): a "Things to do in {city}" card per city of an upcoming or
 * current trip (GetYourGuide, or Viator in the US/CA/MX — utils/activityBooking), then "Booked something? Add it to
 * your trip": the partners never tell us what was booked, so the traveler adds it as a stop (and a wallet reservation).
 * Pure.
 */
import { tripSpan, type SpanTrip } from '@/utils/homeState';
import { addDays } from '@/utils/pastTrip';
import type { TripActivity } from '@/types';

type TourTrip = SpanTrip & {
  destination: { name: string; countryCode: string | null };
  additionalDestinations?: { name: string; countryCode: string | null }[];
};

/** The trip's cities to show the card for: members only, upcoming or current trips (undated counts as upcoming). */
export function tourCities(trip: TourTrip, today: string, isMember: boolean): { index: number; name: string; countryCode: string | null }[] {
  if (!isMember) return [];
  const { end } = tripSpan(trip);
  if (end && end < today) return [];
  return [trip.destination, ...(trip.additionalDestinations ?? [])].map((c, index) => ({ index, name: c.name, countryCode: c.countryCode ?? null }));
}

/** One city's "Things to do" card, shown in that city's section of a multi-city trip (owner 2026-11-11). */
export const toursForCity = <T extends { index: number }>(cities: T[], index: number): T[] => cities.filter((c) => c.index === index);

/** "9:30", "14:05", "7:30 pm", "12 am" → "HH:MM"; anything else → null. */
export function normalizeTime(raw: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (!m[2] && !ap) return null; // a bare number isn't a time
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'pm' ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** What they booked as a stop: an activity the background grounding pass places by name in its city. */
export function bookedStop(a: { name: string; city: string; time: string | null; partner: string }): Omit<TripActivity, 'id' | 'order' | 'createdAt'> {
  return {
    type: 'activity', title: a.name, titleSource: 'user', placeId: null, placeName: null, address: null, lat: null, lng: null,
    searchQuery: `${a.name}, ${a.city}`, startTime: a.time, endTime: null, durationMinutes: null, notes: `Booked on ${a.partner}`,
    bookingRef: null, cost: null, currency: null, mediaUrls: [], visited: false, visitedAt: null, groundingFailedAt: null,
    // Marked booked in the app (final review): no Tickets link and no "still need tickets" for it.
    bookedVia: a.partner,
  } as Omit<TripActivity, 'id' | 'order' | 'createdAt'>;
}

/** The same booking for the wallet (calendar feed, trip bookings); city fields let Pro trip matching link it. */
export function bookedReservation(a: { name: string; date: string | null; time: string | null; city: string; countryCode: string | null; partner: string; ownerUid: string; nowIso: string }) {
  return {
    ownerUid: a.ownerUid, type: 'activity' as const, title: a.name, confirmationCode: '',
    ...(a.date ? { checkIn: a.date } : {}), ...(a.time ? { time: a.time } : {}),
    placeCity: a.city, ...(a.countryCode ? { placeCountryCode: a.countryCode } : {}),
    notes: `Booked on ${a.partner}`, createdAt: a.nowIso,
  };
}

/** Day N's calendar date from the trip's first day, or null without dates. */
export const dayDateFor = (startDay: string | null, dayNumber: number): string | null => (startDay ? addDays(startDay, dayNumber - 1) : null);

/** Which day the sheet starts on: today's day if the trip is under way in that city, else that city's first day. */
export function defaultDayIndex(days: { dayNumber: number; destinationIndex?: number | null }[], cityIndex: number, startDay: string | null, today: string): number {
  const inCity = days.map((d, i) => ({ d, i })).filter(({ d }) => (d.destinationIndex ?? 0) === cityIndex);
  const todays = startDay ? inCity.find(({ d }) => dayDateFor(startDay, d.dayNumber) === today) : undefined;
  return (todays ?? inCity[0])?.i ?? 0;
}

/** The "Tickets" link on a stop row: activity stops with no booking yet, not visited. */
export const showTicketsLink = (a: Pick<TripActivity, 'type'> & { bookingRef?: string | null; fromBooking?: unknown; bookedVia?: unknown; visited?: boolean }) =>
  a.type === 'activity' && !a.bookingRef && !a.fromBooking && !a.bookedVia && !a.visited;

/** The wallet copy needs a date (the wallet lists by check-in; undated ones never show) and room in a free wallet. */
export const walletSaveAllowed = (a: { date: string | null; canAdd: boolean }) => !!a.date && a.canAdd;
