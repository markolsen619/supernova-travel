import { useMemo } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Trip } from '@/types';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { parseDestination, findDestination, splitDestinationTrips, type Destination } from '@/utils/destinations';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

async function fetchDestinations(): Promise<Destination[]> {
  const snap = await getDocs(collection(db, 'destinations'));
  return snap.docs
    .map((d) => parseDestination(d.id, d.data()))
    .filter((d): d is Destination => !!d);
}

/** The whole catalog, once: ~30 reads, cached 12 h (it changes daily at most). */
export function useDestinations(): { destinations: Destination[]; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['destinations'],
    queryFn: fetchDestinations,
    staleTime: TWELVE_HOURS,
  });
  return { destinations: data ?? [], isLoading, isError };
}

/** One destination, from the same cached catalog — a cold deep link loads it too. */
export function useDestination(slug: string): { destination: Destination | null; isLoading: boolean } {
  const { destinations, isLoading } = useDestinations();
  const destination = useMemo(() => findDestination(destinations, slug), [destinations, slug]);
  return { destination, isLoading };
}

/**
 * Public itineraries tagged with this destination, most saved first, split
 * into Supernova picks and travelers' trips. Uses the declared
 * (visibility, destinationKeys CONTAINS, savesCount DESC) index.
 */
export function useDestinationTrips(slug: string): { editorial: Trip[]; community: Trip[]; isLoading: boolean } {
  const moderation = useModeration();
  const { data = [], isLoading } = useQuery({
    queryKey: ['destinationTrips', slug],
    queryFn: async (): Promise<Trip[]> => {
      const snap = await getDocs(query(
        collection(db, 'trips'),
        where('visibility', '==', 'public'),
        where('destinationKeys', 'array-contains', slug),
        orderBy('savesCount', 'desc'),
        limit(30),
      ));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trip);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!slug,
  });
  const split = useMemo(() => splitDestinationTrips(filterVisible(data, moderation, (t) => ({
    authorUid: t.authorUid,
    key: contentKey({ type: 'trip', id: t.id }),
    moderationHidden: t.moderationHidden,
  }))), [data, moderation]);
  return { ...split, isLoading };
}
