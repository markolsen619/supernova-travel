import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, Trip } from '@/types';
import { usePublicTrips } from '@/hooks/useTripList';
import { fetchUserSuggestions } from '@/hooks/useExplore';
import { useAuthStore } from '@/stores/useAuthStore';

export interface OnboardingAvatar {
  uid: string;
  avatarUrl: string | null;
  name: string;
}

export interface OnboardingContent {
  exploreCoverUrl: string | null;
  aiCoverUrl: string | null;
  communityAvatars: OnboardingAvatar[];
  isLoading: boolean;
}

/** Picks slide 1's and slide 2's hero photos from the same public-trips
 * result set, ensuring they never land on the same trip. Pure — no
 * Firestore — exported so it's directly unit-testable. */
export function selectOnboardingCovers(trips: Trip[]): {
  exploreCoverUrl: string | null;
  aiCoverUrl: string | null;
} {
  const exploreTrip = trips.find((t) => !!t.coverImageUrl);
  const aiTrip = trips.find(
    (t) => t.isAiGenerated && !!t.coverImageUrl && t.id !== exploreTrip?.id
  );
  return {
    exploreCoverUrl: exploreTrip?.coverImageUrl ?? null,
    aiCoverUrl: aiTrip?.coverImageUrl ?? null,
  };
}

export function useOnboardingContent(): OnboardingContent {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);

  const { data: trips = [], isLoading: tripsLoading } = usePublicTrips(20);

  // Same queryKey shape as useExplore.ts's own fetchUserSuggestions call —
  // when the user has already visited Explore this session, this is served
  // from TanStack Query's cache with zero extra Firestore round trips.
  const { data: rawSuggestions = [], isLoading: suggestionsLoading } = useQuery<UserProfile[]>({
    queryKey: ['userSuggestions', currentUid ?? 'anon'],
    queryFn: fetchUserSuggestions,
    staleTime: 10 * 60 * 1000,
  });

  const { exploreCoverUrl, aiCoverUrl } = useMemo(
    () => selectOnboardingCovers(trips),
    [trips]
  );

  const communityAvatars: OnboardingAvatar[] = useMemo(() => {
    const filtered: UserProfile[] = currentUid
      ? rawSuggestions.filter((u) => u.uid !== currentUid)
      : rawSuggestions;
    return filtered
      .slice(0, 6)
      .map((u) => ({ uid: u.uid, avatarUrl: u.avatarUrl, name: u.fullName }));
  }, [rawSuggestions, currentUid]);

  return {
    exploreCoverUrl,
    aiCoverUrl,
    communityAvatars,
    isLoading: tripsLoading || suggestionsLoading,
  };
}
