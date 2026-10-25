import { useMemo } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { tripDayCount } from '@/utils/dateRange';
import { feedTripPool, type FeedTrip } from '@/utils/feedMix';

async function fetchFeedTrips(): Promise<FeedTrip[]> {
  const snap = await getDocs(query(collection(db, 'trips'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map((d) => {
    const t = d.data();
    const start = t.startDate?.toDate?.() as Date | undefined;
    const end = t.endDate?.toDate?.() as Date | undefined;
    return {
      id: d.id,
      authorUid: t.authorUid ?? '',
      title: t.title ?? '',
      coverImageUrl: t.coverImageUrl ?? null,
      destinationName: t.destination?.name ?? '',
      days: start && end ? tripDayCount(start, end) : null,
      isEditorial: !!t.isEditorial,
      savesCount: t.savesCount ?? 0,
      createdAtMs: t.createdAt?.toMillis?.() ?? 0,
      moderationHidden: !!t.moderationHidden,
      hasItinerary: t.hasItinerary === true,
    };
  });
}

/** Public trips for the feed's trip cards (spec 2026-10-24-seed-social-design.md): one query, cached 10 minutes, moderation-filtered. */
export function useFeedTrips(): FeedTrip[] {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const moderation = useModeration();
  const { data = [] } = useQuery({ queryKey: ['feedTrips'], queryFn: fetchFeedTrips, staleTime: 10 * 60 * 1000, enabled: !!uid });
  return useMemo(
    () => feedTripPool(
      filterVisible(data, moderation, (t) => ({ authorUid: t.authorUid, key: contentKey({ type: 'trip', id: t.id }), moderationHidden: t.moderationHidden })),
      uid,
    ),
    [data, moderation, uid],
  );
}
