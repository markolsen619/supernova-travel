import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

function followDocId(followerUid: string, followeeUid: string) {
  return `${followerUid}_${followeeUid}`;
}

async function checkIsFollowing(followerUid: string, followeeUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'follows', followDocId(followerUid, followeeUid)));
  return snap.exists();
}

async function followUser(followerUid: string, followeeUid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, 'follows', followDocId(followerUid, followeeUid)), {
      followerUid,
      followeeUid,
      createdAt: serverTimestamp(),
    });
    const followerRef = doc(db, 'users', followerUid);
    const followeeRef = doc(db, 'users', followeeUid);
    const [followerSnap, followeeSnap] = await Promise.all([
      tx.get(followerRef),
      tx.get(followeeRef),
    ]);
    tx.update(followerRef, {
      followingCount: (followerSnap.data()?.followingCount ?? 0) + 1,
    });
    tx.update(followeeRef, {
      followersCount: (followeeSnap.data()?.followersCount ?? 0) + 1,
    });
  });
}

async function unfollowUser(followerUid: string, followeeUid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, 'follows', followDocId(followerUid, followeeUid)));
    const followerRef = doc(db, 'users', followerUid);
    const followeeRef = doc(db, 'users', followeeUid);
    const [followerSnap, followeeSnap] = await Promise.all([
      tx.get(followerRef),
      tx.get(followeeRef),
    ]);
    tx.update(followerRef, {
      followingCount: Math.max(0, (followerSnap.data()?.followingCount ?? 1) - 1),
    });
    tx.update(followeeRef, {
      followersCount: Math.max(0, (followeeSnap.data()?.followersCount ?? 1) - 1),
    });
  });
}

export function useIsFollowing(followeeUid: string | null) {
  const followerUid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['isFollowing', followerUid, followeeUid],
    queryFn: () => checkIsFollowing(followerUid, followeeUid!),
    enabled: !!followerUid && !!followeeUid && followerUid !== followeeUid,
    staleTime: 2 * 60 * 1000,
  });
}

export function useFollow(followeeUid: string) {
  const followerUid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['isFollowing', followerUid, followeeUid] });
    queryClient.invalidateQueries({ queryKey: ['userProfile', followeeUid] });
    queryClient.invalidateQueries({ queryKey: ['userProfile', followerUid] });
  };

  const follow = useMutation({
    mutationFn: () => followUser(followerUid, followeeUid),
    onSuccess: invalidate,
  });

  const unfollow = useMutation({
    mutationFn: () => unfollowUser(followerUid, followeeUid),
    onSuccess: invalidate,
  });

  return { follow, unfollow };
}
