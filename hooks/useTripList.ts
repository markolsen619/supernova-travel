import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
} from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { Trip, Destination } from '@/types';
import { mergeNewestFirst } from '@/utils/tripMerge';

// Destinations predate the bounding-box feature — default rather than leaving
// `undefined`, which Destination's type (PlaceViewportBounds | null, not
// optional) doesn't account for. Applies to additionalDestinations too.
export function normalizeDestination(d: DocumentData | undefined): Destination {
  return { ...(d ?? {}), bounds: d?.bounds ?? null } as Destination;
}

// Older trips predate the budget feature — default rather than leaving
// `undefined`, which the Trip type (number | null, not optional) doesn't
// account for. Same reasoning for additionalDestinations (predates the
// multi-destination feature; Trip's type is Destination[], not optional).
function normalizeTrip(id: string, data: DocumentData): Trip {
  return {
    id,
    ...data,
    destination: normalizeDestination(data.destination),
    additionalDestinations: (data.additionalDestinations ?? []).map(normalizeDestination),
  } as Trip;
}

async function fetchUserTrips(uid: string): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => normalizeTrip(doc.id, doc.data()));
}

async function fetchPublicTrips(limitCount = 20): Promise<Trip[]> {
  const q = query(
    collection(db, 'trips'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => normalizeTrip(doc.id, doc.data()));
}

/**
 * Another traveler's trips that the viewer may see: public ones, plus
 * followers-only ones when the viewer follows them.
 *
 * Two queries, each constrained to one visibility, because Firestore rules
 * are not filters. A query for every trip by `authorUid` is refused outright
 * the moment that author has a single trip the viewer can't read — which is
 * why a friend's Trips tab used to come back empty. Constraining visibility
 * lets the rules prove every result readable (see canRead in
 * firestore.rules). Needs the (authorUid, visibility, createdAt desc) index.
 */
async function fetchVisibleUserTrips(uid: string, viewerFollows: boolean): Promise<Trip[]> {
  const byVisibility = async (visibility: 'public' | 'followers') => {
    const snap = await getDocs(query(
      collection(db, 'trips'),
      where('authorUid', '==', uid),
      where('visibility', '==', visibility),
      orderBy('createdAt', 'desc'),
      limit(50),
    ));
    return snap.docs.map((doc) => normalizeTrip(doc.id, doc.data()));
  };
  const [publicTrips, followerTrips] = await Promise.all([
    byVisibility('public'),
    viewerFollows ? byVisibility('followers') : Promise.resolve([]),
  ]);
  return mergeNewestFirst(publicTrips, followerTrips);
}

/**
 * The Trips tab on a profile. Your own profile shows everything; anyone
 * else's shows what fetchVisibleUserTrips allows.
 */
export function useProfileTrips(uid: string | null, opts: { isOwnProfile: boolean; viewerFollows: boolean }) {
  const scope = opts.isOwnProfile ? 'all' : opts.viewerFollows ? 'followers' : 'public';
  return useQuery({
    // Under ['trips', uid] so updateTrip's ['trips'] invalidation reaches it.
    queryKey: ['trips', uid, scope],
    queryFn: () => (opts.isOwnProfile ? fetchUserTrips(uid!) : fetchVisibleUserTrips(uid!, opts.viewerFollows)),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTripList(uid: string | null) {
  return useQuery({
    queryKey: ['trips', uid],
    queryFn: () => fetchUserTrips(uid!),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePublicTrips(count = 20) {
  return useQuery({
    queryKey: ['publicTrips', count],
    queryFn: () => fetchPublicTrips(count),
    staleTime: 5 * 60 * 1000,
  });
}
