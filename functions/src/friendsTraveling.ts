/** Friends on a trip, on the globe (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md). Pure. */
export type Place = { name?: string; lat?: number | null; lng?: number | null };
export type TripLike = {
  visibility?: string; moderationHidden?: boolean; startDateMs?: number | null; endDateMs?: number | null;
  destination?: Place | null; additionalDestinations?: Place[] | null; collaborators?: string[]; authorUid?: string;
};
export type DayLike = { dateMs: number | null; destinationIndex: number | null };

const HALF_DAY = 12 * 3_600_000;
/** Dates are stored at the creator's local midnight; reading at noon gives that calendar day anywhere. */
export function calendarDay(ms: number): string {
  return new Date(ms + HALF_DAY).toISOString().slice(0, 10);
}
export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
const SHARED = new Set(['public', 'followers']);

export function isTripUnderwayToday(trip: TripLike, today: string): boolean {
  if (!SHARED.has(trip.visibility ?? '') || trip.moderationHidden) return false;
  if (trip.startDateMs == null || trip.endDateMs == null) return false;
  return calendarDay(trip.startDateMs) <= today && today <= calendarDay(trip.endDateMs);
}

export function todaysCity(trip: TripLike, days: DayLike[], today: string): { city: string; lat: number; lng: number } | null {
  const day = days.find((d) => d.dateMs != null && calendarDay(d.dateMs) === today);
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
]);
/** Trips are written constantly; only these fields move a friend on the globe. */
export function travelInputsChanged(before: TripLike | null, after: TripLike | null): boolean {
  return pick(before) !== pick(after);
}
