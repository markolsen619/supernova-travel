import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Trip } from '@/types';
import { aggregateDestinations, type TrendingPlace } from '@/utils/trendingPlaces';

/** Trips scanned before aggregation. Well above the 50 pins kept, so a
 *  popular destination reached by many trips still ranks correctly. */
const TRIP_SCAN_LIMIT = 150;

async function fetchTrendingTrips(): Promise<Trip[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'trips'),
        where('visibility', '==', 'public'),
        orderBy('savesCount', 'desc'),
        limit(TRIP_SCAN_LIMIT),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trip);
  } catch (error) {
    // This composite index (visibility ASC, savesCount DESC) may not exist
    // yet — Firestore throws failed-precondition with a console link. Degrade
    // to a globe with no trending pins rather than breaking the whole screen,
    // so the index stays a deployment step and not a blocker.
    console.warn('[useTrendingPlaces] query failed — rendering no trending pins:', error);
    return [];
  }
}

/**
 * Destinations to show on the globe at low zoom.
 *
 * One query, cached for ten minutes, independent of camera state: panning and
 * zooming the globe costs nothing. This is the whole reason the curated layer
 * is Firestore-backed rather than a viewport Places search.
 */
export function useTrendingPlaces(): { places: TrendingPlace[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['trendingPlaces'],
    queryFn: async (): Promise<TrendingPlace[]> =>
      aggregateDestinations(await fetchTrendingTrips()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return { places: data ?? [], isLoading };
}
