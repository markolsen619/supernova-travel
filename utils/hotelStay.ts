import type { ActivityType } from '@/types';

interface StayActivity {
  id: string;
  type: ActivityType;
  placeId: string | null;
  placeName?: string | null;
}

interface StayDay {
  dayNumber: number;
  /** The day's own date, when the trip stored one. */
  date: Date | null;
  activities: StayActivity[];
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameHotel(a: StayActivity, b: StayActivity): boolean {
  if (a.id === b.id) return true;
  if (a.type !== 'hotel' || b.type !== 'hotel') return false;
  if (a.placeId && a.placeId === b.placeId) return true;
  return !!a.placeName && a.placeName === b.placeName;
}

/**
 * The nights spent at the hotel `stop` belongs to, for the Booking.com
 * hand-off: from the first day that hotel appears in the itinerary to the
 * last (its check-out stop), or to the end of the trip when there's no
 * check-out stop. Using the whole trip's dates instead booked a multi-city
 * traveler into their first hotel for every night of the trip.
 */
export function hotelStayDates(
  days: StayDay[],
  stop: StayActivity,
  trip: { start: Date | null; end: Date | null },
): { checkIn: Date | null; checkOut: Date | null } {
  const dateOf = (day: StayDay): Date | null =>
    day.date ?? (trip.start ? addDays(trip.start, day.dayNumber - 1) : null);

  const stayDays = days
    .filter((day) => day.activities.some((a) => isSameHotel(stop, a)))
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (stayDays.length === 0) return { checkIn: null, checkOut: null };

  const checkIn = dateOf(stayDays[0]);
  if (!checkIn) return { checkIn: null, checkOut: null };

  const lastSeen = dateOf(stayDays[stayDays.length - 1]);
  if (lastSeen && lastSeen > checkIn) return { checkIn, checkOut: lastSeen };
  if (trip.end && trip.end > checkIn) return { checkIn, checkOut: trip.end };
  // Booking.com needs at least one night.
  return { checkIn, checkOut: addDays(checkIn, 1) };
}
