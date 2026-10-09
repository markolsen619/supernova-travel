/**
 * The time shown on a trip stop. Stops have no preset times (AI itineraries
 * leave them blank — the day's order is the plan): a time is yours, typed on
 * the stop, or comes from the wallet booking matched to it (utils/bookingDays
 * bookingMatchesStop) — shown, not copied, so it follows the booking if it changes.
 */
export function stopTime(activity: { startTime?: string | null }, bookedTime: string | null | undefined): { time: string | null; fromBooking: boolean } {
  if (activity.startTime) return { time: activity.startTime, fromBooking: false };
  if (bookedTime) return { time: bookedTime, fromBooking: true };
  return { time: null, fromBooking: false };
}
