import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { UserProfile } from '@/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePublicTrips } from '@/hooks/useTripList';

async function fetchUserSuggestions(): Promise<UserProfile[]> {
  const q = query(
    collection(db, 'users'),
    orderBy('followersCount', 'desc'),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: data.displayName ?? '',
      username: data.username ?? data.displayName?.toLowerCase().replace(/\s+/g, '') ?? '',
      avatarUrl: data.avatarUrl ?? null,
      bio: data.bio ?? '',
      location: data.location ?? '',
      followersCount: data.followersCount ?? 0,
      followingCount: data.followingCount ?? 0,
      tripsCount: data.tripsCount ?? 0,
      tier: data.tier ?? 'free',
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    } as UserProfile;
  });
}

export function useExplore(): {
  trips: import('@/types').Trip[];
  tripsLoading: boolean;
  suggestions: UserProfile[];
  suggestionsLoading: boolean;
} {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);

  const { data: trips = [], isLoading: tripsLoading } = usePublicTrips(20);

  const { data: rawSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ['userSuggestions'],
    queryFn: fetchUserSuggestions,
    staleTime: 10 * 60 * 1000,
  });

  const suggestions = currentUid
    ? rawSuggestions.filter((u) => u.uid !== currentUid)
    : rawSuggestions;

  return { trips, tripsLoading, suggestions, suggestionsLoading };
}
