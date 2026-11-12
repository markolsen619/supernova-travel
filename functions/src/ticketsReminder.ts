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

/**
 * "May" still need tickets: the count is every sightseeing stop without a booking, and many (a market, a bridge) are
 * free. A multi-city trip is named by its first city + how many more, since the count covers the whole trip (owner,
 * 2026-11-11 — "Prague in 7 days · 6 stops" read as six in Prague).
 */
export const ticketsReminderCopy = (cities: string[], count: number) => {
  const names = cities.map((c) => c.trim()).filter(Boolean);
  const more = names.length - 1;
  const where = names.length === 0 ? 'Your trip' : more > 0 ? `${names[0]} + ${more} more ${more === 1 ? 'city' : 'cities'}` : names[0];
  return {
    title: `${where} in 7 days`,
    body: `${count} stops ${more > 0 ? 'across your trip ' : ''}may still need tickets. Book them before they sell out.`,
  };
};
