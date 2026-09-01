import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '@/types';
import { fetchUserSuggestions } from '@/hooks/useExplore';
import { useAuthStore } from '@/stores/useAuthStore';

export interface OnboardingAvatar {
  uid: string;
  avatarUrl: string | null;
  name: string;
}

export interface OnboardingContent {
  communityAvatars: OnboardingAvatar[];
}

export function useOnboardingContent(): OnboardingContent {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);

  // Same queryKey shape as useExplore.ts's own fetchUserSuggestions call —
  // when the user has already visited Explore this session, this is served
  // from TanStack Query's cache with zero extra Firestore round trips.
  const { data: rawSuggestions = [] } = useQuery<UserProfile[]>({
    queryKey: ['userSuggestions', currentUid ?? 'anon'],
    queryFn: fetchUserSuggestions,
    staleTime: 10 * 60 * 1000,
  });

  const communityAvatars: OnboardingAvatar[] = useMemo(() => {
    const filtered: UserProfile[] = currentUid
      ? rawSuggestions.filter((u) => u.uid !== currentUid)
      : rawSuggestions;
    return filtered
      .slice(0, 6)
      .map((u) => ({ uid: u.uid, avatarUrl: u.avatarUrl, name: u.fullName }));
  }, [rawSuggestions, currentUid]);

  return { communityAvatars };
}
