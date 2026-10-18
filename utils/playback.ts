/**
 * The trip map's playback (flyover) for every trip, not just AI ones (owner, 2026-10-17): whole-trip
 * playback when days hold a single located stop, how each leg was travelled, and the photos the trip's
 * members took at each stop. Pure.
 */
import { bookingsByDay, type TripBooking } from '@/utils/bookingDays';
import type { Travel } from '@/utils/tripRoutes';

/**
 * Day by day when some day has two located stops (AI trips); otherwise the whole trip as one route
 * through every located stop, city to city (hand-made trips like Prague → … → Amsterdam, one stop a day).
 */
export function playbackPlan(stopsByDay: [string, { id: string }[]][]): 'byDay' | 'wholeTrip' | 'none' {
  if (stopsByDay.some(([, stops]) => stops.length >= 2)) return 'byDay';
  const total = stopsByDay.reduce((n, [, stops]) => n + stops.length, 0);
  return total >= 2 ? 'wholeTrip' : 'none';
}

const CRUISE = /\bcruise\b/i;

/** How the traveler reached each day, from that day's bookings: a flight, a train / bus / ferry ticket, a cruise. */
export function arrivalHints(days: { id: string; date: Date | null }[], bookings: TripBooking[]): Record<string, Travel> {
  const out: Record<string, Travel> = {};
  for (const [dayId, list] of Object.entries(bookingsByDay(days, bookings))) {
    for (const d of list) {
      const b = d.booking;
      let travel: Travel | null = null;
      if (b.kind === 'boarding_pass') travel = 'flight';
      else if (b.item.transitMode === 'train') travel = 'train';
      else if (b.item.transitMode === 'bus') travel = 'bus';
      else if (b.item.transitMode === 'ferry') travel = CRUISE.test(b.item.title) ? 'cruise' : 'ferry';
      else if (CRUISE.test(b.item.title)) travel = 'cruise';
      if (travel) { out[dayId] = travel; break; }
    }
  }
  return out;
}

const BY: Record<Travel, string> = {
  walk: 'On foot to', drive: 'By car to', bus: 'By bus to', train: 'By train to', flight: 'By plane to', ferry: 'By ferry to', cruise: 'By cruise ship to',
};

export function travelLabel(travel: Travel, to: string): string {
  return `${BY[travel]} ${to}`;
}

export interface StopPhoto { url: string; uid: string; name: string; avatarUrl: string | null }

/**
 * The photos shown at each stop during playback: the stop's journal photos (written by the organizer) and the
 * photos trip members added to that place in their reviews. Hidden reviews and blocked people are left out.
 */
export function stopPhotos(
  stops: { id: string; placeId: string | null }[],
  journals: Record<string, string[]>,
  organizerUid: string,
  reviews: { uid: string; placeId: string; photoUrls: string[]; moderationHidden?: boolean }[],
  memberUids: string[],
  profiles: Record<string, { name?: string; avatarUrl?: string | null } | undefined>,
  blocked: Set<string>,
): Record<string, StopPhoto[]> {
  const who = (uid: string) => ({ uid, name: profiles[uid]?.name || 'Traveler', avatarUrl: profiles[uid]?.avatarUrl ?? null });
  const members = new Set(memberUids);
  const out: Record<string, StopPhoto[]> = {};
  for (const stop of stops) {
    const list: StopPhoto[] = (journals[stop.id] ?? []).map((url) => ({ url, ...who(organizerUid) }));
    if (stop.placeId) {
      for (const r of reviews) {
        if (r.placeId !== stop.placeId || r.moderationHidden || !members.has(r.uid) || blocked.has(r.uid)) continue;
        for (const url of r.photoUrls) list.push({ url, ...who(r.uid) });
      }
    }
    if (list.length) out[stop.id] = list;
  }
  return out;
}
