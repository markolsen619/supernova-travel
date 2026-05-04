import { useAuthStore } from '@/stores/useAuthStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useIsFollowing } from '@/hooks/useFollow';
import { UserProfile } from '@/types';

export function usePublicProfile(targetUid: string | null): {
  profile: UserProfile | null | undefined;
  isLoading: boolean;
  isFollowing: boolean;
  isOwnProfile: boolean;
} {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: profile, isLoading } = useUserProfile(targetUid);
  const { data: isFollowing = false } = useIsFollowing(targetUid);
  const isOwnProfile = !!currentUid && currentUid === targetUid;
  return { profile, isLoading, isFollowing, isOwnProfile };
}
