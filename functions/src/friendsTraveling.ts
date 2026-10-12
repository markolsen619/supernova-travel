/** Friends on a trip, on the globe (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md). Pure. */
export type Place = { name?: string; lat?: number | null; lng?: number | null };
export type TripLike = {
  visibility?: string; moderationHidden?: boolean; startDateMs?: number | null; endDateMs?: number | null;
  destination?: Place | null; additionalDestinations?: Place[] | null; collaborators?: string[]; authorUid?: string;
  /** The exact first day ("YYYY-MM-DD") the app saves since 1.0.4 — right in every time zone. */
  startDay?: string | null;
};
export type DayLike = { dateMs: number | null; destinationIndex: number | null; dayNumber?: number | null };

const HALF_DAY = 12 * 3_600_000;
/** Dates are stored at the creator's local midnight; reading at noon gives that calendar day from UTC−11 to UTC+12. */
export function calendarDay(ms: number): string {
  return new Date(ms + HALF_DAY).toISOString().slice(0, 10);
}
export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
const SHARED = new Set(['public', 'followers']);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The trip's first and last calendar days. The noon rule (calendarDay) is right from UTC−11 to UTC+12;
 * the saved startDay is exact everywhere (New Zealand summer is UTC+13), so it wins while it agrees with
 * the date within a day, and the end shifts by the same amount (review, 2026-10-12).
 */
export function tripDays(trip: TripLike): { start: string; end: string } | null {
  if (trip.startDateMs == null || trip.endDateMs == null) return null;
  const stampStart = calendarDay(trip.startDateMs);
  const saved = typeof trip.startDay === 'string' && DAY_RE.test(trip.startDay) && Math.abs(daysBetween(stampStart, trip.startDay)) <= 1
    ? trip.startDay : null;
  const offset = saved ? daysBetween(stampStart, saved) : 0;
  return { start: saved ?? stampStart, end: addDays(calendarDay(trip.endDateMs), offset) };
}

export function isTripUnderwayToday(trip: TripLike, today: string): boolean {
  if (!SHARED.has(trip.visibility ?? '') || trip.moderationHidden) return false;
  const span = tripDays(trip);
  return !!span && span.start <= today && today <= span.end;
}

/** A day's calendar day: day 1 is the trip's first day; a stored date (rare) is read by the noon rule. */
export function dayKey(trip: TripLike, d: DayLike): string | null {
  if (d.dateMs != null) return calendarDay(d.dateMs);
  const span = tripDays(trip);
  if (!span || d.dayNumber == null) return null;
  return addDays(span.start, d.dayNumber - 1);
}

export function todaysCity(trip: TripLike, days: DayLike[], today: string): { city: string; lat: number; lng: number } | null {
  const day = days.find((d) => dayKey(trip, d) === today);
  if (!day) return null;
  const places = [trip.destination ?? null, ...(trip.additionalDestinations ?? [])];
  const p = places[day.destinationIndex ?? 0] ?? places[0];
  if (!p || p.lat == null || p.lng == null || !p.name) return null;
  return { city: p.name, lat: p.lat, lng: p.lng };
}

export function pickTodayTrip<T extends { dayStartMs: number }>(candidates: T[]): T | null {
  return candidates.reduce<T | null>((best, c) => (!best || c.dayStartMs > best.dayStartMs ? c : best), null);
}

export function shouldSeeTraveler(p: {
  viewerFollowsTraveler: boolean; viewerFollowsAuthor: boolean; travelerIsAuthor: boolean;
  visibility: string; showOnGlobe: boolean | undefined; blocked: boolean;
}): boolean {
  if (p.showOnGlobe === false || p.blocked || !p.viewerFollowsTraveler) return false;
  // A collaborator on a followers-only trip: only viewers who can open it (they follow its author).
  if (!p.travelerIsAuthor && p.visibility === 'followers' && !p.viewerFollowsAuthor) return false;
  return true;
}

const pick = (t: TripLike | null) => t && JSON.stringify([
  t.visibility, !!t.moderationHidden, t.startDateMs ?? null, t.endDateMs ?? null,
  t.destination ?? null, t.additionalDestinations ?? null, [...(t.collaborators ?? [])].sort(), t.authorUid ?? null,
  t.startDay ?? null,
]);
/** Trips are written constantly; only these fields move a friend on the globe. */
export function travelInputsChanged(before: TripLike | null, after: TripLike | null): boolean {
  return pick(before) !== pick(after);
}
