import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { toCalendarDate } from '@/utils/calendarDate';
import type { TripSummary } from '@/utils/walletLink';

/** Trips a booking can belong to: yours and ones you're on. Soonest-ending last; Dates TBD at the end. */
export function useMyTrips(enabled = true) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['myTrips', uid],
    enabled: enabled && !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<TripSummary[]> => {
      const [own, shared] = await Promise.all([
        getDocs(query(collection(db, 'trips'), where('authorUid', '==', uid))),
        getDocs(query(collection(db, 'trips'), where('collaborators', 'array-contains', uid))),
      ]);
      const byId = new Map<string, TripSummary>();
      for (const d of [...own.docs, ...shared.docs]) {
        const t = d.data();
        byId.set(d.id, {
          tripId: d.id,
          title: String(t.title ?? ''),
          start: t.startDate?.toDate ? toCalendarDate(t.startDate.toDate()) : null,
          end: t.endDate?.toDate ? toCalendarDate(t.endDate.toDate()) : null,
        });
      }
      return [...byId.values()].sort((a, b) => {
        if (!a.start) return 1;
        if (!b.start) return -1;
        return b.start.localeCompare(a.start);
      });
    },
  });
  return { trips, isLoading };
}
