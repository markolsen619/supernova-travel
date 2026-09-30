import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { fetchLeg } from '@/services/mapboxDirections';
import type { LegCache, MissingLeg } from '@/utils/tripRoutes';

/**
 * The trip's cached route legs, filling in any that are missing.
 *
 * `missing` comes from buildPath() for every path the map may draw (each
 * planned day and the actual route). Only an owner/collaborator fetches:
 * a viewer can't write the cache, so fetching for them would re-bill the
 * same legs on every open — they see arcs until the owner opens the trip.
 */
export function useTripRoutes(tripId: string, missing: MissingLeg[], canWrite: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ['tripRoutes', tripId];
  const attempted = useRef<Set<string>>(new Set());

  const { data: cache = {}, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<LegCache> => {
      const snap = await getDoc(doc(db, 'trips', tripId, 'routes', 'cache'));
      return (snap.data()?.legs as LegCache | undefined) ?? {};
    },
    staleTime: 30 * 60 * 1000,
  });

  const missingKey = missing.map((m) => m.key).join('|');
  useEffect(() => {
    if (!canWrite || isLoading) return;
    const todo = missing.filter((m) => !cache[m.key] && !attempted.current.has(m.key));
    if (todo.length === 0) return;
    todo.forEach((m) => attempted.current.add(m.key));

    let cancelled = false;
    (async () => {
      const fetched: LegCache = {};
      // Three at a time: fast enough for a week's itinerary, gentle on the API.
      for (let i = 0; i < todo.length; i += 3) {
        const batch = await Promise.all(todo.slice(i, i + 3).map(async (m) => [m.key, await fetchLeg(m)] as const));
        batch.forEach(([k, v]) => { fetched[k] = v; });
      }
      if (cancelled) return;
      queryClient.setQueryData<LegCache>(queryKey, (old) => ({ ...(old ?? {}), ...fetched }));
      try {
        await setDoc(doc(db, 'trips', tripId, 'routes', 'cache'), { legs: fetched }, { merge: true });
      } catch (err) {
        console.error('[useTripRoutes] cache write failed', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the set of missing legs, not array identity
  }, [missingKey, canWrite, isLoading, tripId]);

  return { cache, isLoading };
}
