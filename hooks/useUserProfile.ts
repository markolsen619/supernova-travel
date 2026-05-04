import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { UserProfile } from '@/types';

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
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
}

export function useUserProfile(uid: string | null) {
  return useQuery({
    queryKey: ['userProfile', uid],
    queryFn: () => fetchUserProfile(uid!),
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
  });
}
