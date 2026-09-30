import type { TripStatus } from '@/types';

/**
 * What a trip is right now, from its dates — so it reads "Live" on its first
 * day and "Completed" after its last without anyone editing it. The stored
 * `status` only matters without dates, or when the traveler closed the trip
 * early (completed stays completed).
 *
 * Calendar days in local time: a trip is live from 00:00 on its first day to
 * 23:59 on its last, wherever the traveler is.
 */
export function displayStatus(
  trip: { status?: TripStatus | null; startDate: Date | null; endDate: Date | null },
  now: Date,
): TripStatus {
  const stored = trip.status ?? 'planning';
  if (stored === 'completed') return 'completed';
  if (!trip.startDate || !trip.endDate) return stored;

  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  if (today < day(trip.startDate)) return 'planning';
  if (today <= day(trip.endDate)) return 'active';
  return 'completed';
}

export const STATUS_LABEL: Record<TripStatus, string> = {
  planning: 'Upcoming',
  active: 'Live',
  completed: 'Completed',
};

/** Firestore Timestamp | Date | null → Date | null, for displayStatus. */
export function toDateOrNull(v: { toDate(): Date } | Date | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : v.toDate();
}
