import { mergeNewestFirst } from '@/utils/tripMerge';

interface OwnedTrip {
  id: string;
  authorUid: string;
  createdAt: { toMillis: () => number } | null;
}

/**
 * Your own Trips tab: trips you created plus trips you joined by accepting an
 * invite. Before this, a joined trip appeared nowhere but the invite
 * notification — the tab only read `authorUid == you`.
 */
export function ownAndJoinedTrips<T extends OwnedTrip>(own: T[], joined: T[]): T[] {
  return mergeNewestFirst(own, joined);
}

/** Someone else's trip you're on. Never backfill or edit it as if it were yours. */
export function isJoinedTrip(trip: { authorUid: string }, uid: string): boolean {
  return trip.authorUid !== uid;
}

/** Owners to look up for joined trips' cards — once each, never you. */
export function joinedTripOwners(trips: { authorUid: string }[], uid: string): string[] {
  return [...new Set(trips.filter((t) => isJoinedTrip(t, uid)).map((t) => t.authorUid))];
}
