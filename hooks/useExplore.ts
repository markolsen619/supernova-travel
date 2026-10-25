import { useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { UserProfile, Trip } from '@/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePublicTrips } from '@/hooks/useTripList';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';

/** A users/{uid} document as a UserProfile (shared with useTravelerSuggestions). */
export function toUserProfile(id: string, data: Record<string, any>): UserProfile {
  const fullName: string = data.fullName ?? data.displayName ?? '';
  return {
    uid: id,
    fullName,
    username: data.username ?? fullName.toLowerCase().replace(/\s+/g, '') ?? '',
    avatarUrl: data.avatarUrl ?? null,
    bio: data.bio ?? '',
    location: data.location ?? '',
    followersCount: data.followersCount ?? 0,
    followingCount: data.followingCount ?? 0,
    tripsCount: data.tripsCount ?? 0,
    settings: { privacy: data.settings?.privacy === 'private' ? 'private' : 'public' },
    tier: data.tier ?? 'free',
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  } as UserProfile;
}

export async function fetchUserSuggestions(): Promise<UserProfile[]> {
  const q = query(
    collection(db, 'users'),
    orderBy('followersCount', 'desc'),
    limit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => toUserProfile(doc.id, doc.data()));
}

export function useExplore(): {
  trips: Trip[];
  tripsLoading: boolean;
  suggestions: UserProfile[];
  suggestionsLoading: boolean;
} {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);

  const moderation = useModeration();
  const { data: allTrips = [], isLoading: tripsLoading } = usePublicTrips(20);
  const trips = useMemo(
    () =>
      // Only trips with a real itinerary (2026-10-25): an empty "Trip to Rome" disappoints whoever opens it.
      filterVisible(allTrips.filter((t) => t.hasItinerary === true), moderation, (t) => ({
        authorUid: t.authorUid,
        key: contentKey({ type: 'trip', id: t.id }),
        moderationHidden: t.moderationHidden,
      })),
    [allTrips, moderation],
  );

  const { data: rawSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ['userSuggestions', currentUid ?? 'anon'],
    queryFn: fetchUserSuggestions,
    staleTime: 10 * 60 * 1000,
  });

  const suggestions = useMemo(
    () => rawSuggestions.filter((u) => u.uid !== currentUid && !moderation.blockedUids.has(u.uid)),
    [rawSuggestions, currentUid, moderation],
  );

  return { trips, tripsLoading, suggestions, suggestionsLoading };
}
