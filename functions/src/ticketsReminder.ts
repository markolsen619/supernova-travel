/**
 * "Still need tickets" (owner, 2026-11-08): 7 days before a trip starts, if 2+ activity stops have no booking yet, one
 * push to the owner and members — "Lisbon in 7 days · 3 stops still need tickets" — opening the trip, whose stops carry
 * the Tickets links. Pure; ticketsReminderFunctions.ts reads trips and sends.
 */
export const stopsNeedingTickets = (stops: { type?: unknown; bookingRef?: unknown; fromBooking?: unknown; bookedVia?: unknown; visited?: unknown }[]) =>
  stops.filter((s) => s.type === 'activity' && !s.bookingRef && !s.fromBooking && !s.bookedVia && s.visited !== true).length;

/** The run's own UTC date (final review: calendarDay adds 12 h, which made it tomorrow at 15:00 — sent 8 days early). */
export const reminderToday = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10);

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const reminderDue = (t: { startDay: string | null; count: number; alreadySent: boolean }, today: string) =>
  !!t.startDay && !t.alreadySent && t.count >= 2 && t.startDay === addDays(today, 7);

export const ticketsReminderCopy = (city: string, count: number) => ({
  title: `${city} in 7 days`,
  body: `${count} stops still need tickets. Book them before they sell out.`,
});
