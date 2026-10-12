import { useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { isCurrentEntry } from '@/utils/friendsTraveling';

export interface FriendTraveling {
  uid: string;
  name: string;
  avatarUrl: string | null;
  tripId: string;
  tripTitle: string;
  city: string;
  lat: number;
  lng: number;
  day: string;
}

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * People you follow who are on a trip today, at that day's city (docs/superpowers/specs/
 * 2026-10-12-friends-on-trips-design.md). One read of your own server-kept list; only entries dated
 * today, so an ended trip never lingers even if the hourly cleanup is late; blocked/reported filtered.
 */
export function useFriendsTraveling(): FriendTraveling[] {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const moderation = useModeration();
  const { data = [] } = useQuery({
    queryKey: ['friendsTraveling', uid],
    enabled: !!uid,
    staleTime: TEN_MINUTES,
    // The Search tab stays mounted: poll while it's open.
    refetchInterval: TEN_MINUTES,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<FriendTraveling[]> => {
      const snap = await getDocs(collection(db, 'users', uid!, 'friendsTraveling'));
      return snap.docs.map((d) => d.data() as FriendTraveling).filter((e) => typeof e.lat === 'number' && typeof e.lng === 'number');
    },
  });
  return useMemo(() => {
    const now = new Date();
    return filterVisible(data, moderation, (e) => ({ authorUid: e.uid, key: contentKey({ type: 'trip', id: e.tripId }) })).filter((e) => isCurrentEntry(e, now));
  }, [data, moderation]);
}
