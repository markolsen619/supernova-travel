/**
 * "Still need tickets" (owner, 2026-11-08): 7 days before a trip starts, if 2+ activity stops have no booking yet, one
 * push to the owner and members — "Lisbon in 7 days · 3 stops still need tickets" — opening the trip, whose stops carry
 * the Tickets links. Pure; ticketsReminderFunctions.ts reads trips and sends.
 */
export const stopsNeedingTickets = (stops: { type?: unknown; bookingRef?: unknown; fromBooking?: unknown; visited?: unknown }[]) =>
  stops.filter((s) => s.type === 'activity' && !s.bookingRef && !s.fromBooking && s.visited !== true).length;

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const reminderDue = (t: { startDay: string | null; count: number; alreadySent: boolean }, today: string) =>
  !!t.startDay && !t.alreadySent && t.count >= 2 && t.startDay === addDays(today, 7);

export const ticketsReminderCopy = (city: string, count: number) => ({
  title: `${city} in 7 days`,
  body: `${count} stops still need tickets. Book them before they sell out.`,
});
