import { collection, getDocs, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';

async function fetchMutualFriends(uid: string): Promise<string[]> {
  const [followingSnap, followersSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerUid', '==', uid))),
    getDocs(query(collection(db, 'follows'), where('followeeUid', '==', uid))),
  ]);
  const following = new Set(followingSnap.docs.map((d) => d.data().followeeUid as string));
  const followers = new Set(followersSnap.docs.map((d) => d.data().followerUid as string));
  return Array.from(following).filter((otherUid) => followers.has(otherUid));
}

/** Intersection of "people I follow" and "people who follow me" — the
 * audience for starting a new DM (direct or group). Stricter than
 * useFollowConnections (union), which trip invites intentionally keep using. */
export function useMutualFriends(uid: string | null) {
  return useQuery({
    queryKey: ['mutualFriends', uid],
    queryFn: () => fetchMutualFriends(uid!),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
