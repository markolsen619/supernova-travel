// hooks/useOfflinePrefetch.ts
/**
 * While online, quietly loads the full details of the trips kept for offline use (spec §1): only those whose
 * saved copy is missing or older than 12 h, one at a time, so it costs little and never competes with the
 * screen the user is on.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMyTrips } from '@/hooks/useMyTrips';
import { useIsOnline } from '@/services/offline';
import { knownTrips } from '@/services/queryPersist';
import { fetchTripWithDays } from '@/hooks/useTrip';
import { fetchTripBookings } from '@/hooks/useTripBookings';
import { fetchPackingItems } from '@/hooks/usePackingList';
import { needsPrefetch, offlineTripSet } from '@/utils/offlineCache';

export function useOfflinePrefetch(): void {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const online = useIsOnline();
  const { trips } = useMyTrips(!!uid);
  const listKey = (trips ?? []).map((t) => t.tripId).join(',');

  useEffect(() => {
    if (!uid || !online || !listKey) return;
    let cancelled = false;
    (async () => {
      const ids = offlineTripSet(knownTrips(queryClient, uid), new Date());
      for (const id of ids) {
        if (cancelled) return;
        const state = queryClient.getQueryState(['trip', id]);
        if (!needsPrefetch(state?.dataUpdatedAt, Date.now())) continue;
        try {
          await queryClient.prefetchQuery({ queryKey: ['trip', id], queryFn: () => fetchTripWithDays(id) });
          await queryClient.prefetchQuery({ queryKey: ['tripBookings', id, uid], queryFn: () => fetchTripBookings(id, uid) });
          await queryClient.prefetchQuery({ queryKey: ['packingItems', id], queryFn: () => fetchPackingItems(id) });
        } catch (e) {
          console.warn('[offline] prefetch failed for', id, e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [uid, online, listKey, queryClient]);
}
