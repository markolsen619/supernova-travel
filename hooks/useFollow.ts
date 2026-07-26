import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  collection,
  getDocs,
  query,
  where,
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
    // Firestore transactions require every read before any write — reads
    // first, then the follow-doc write and count updates.
    const followerRef = doc(db, 'users', followerUid);
    const followeeRef = doc(db, 'users', followeeUid);
    const [followerSnap, followeeSnap] = await Promise.all([
      tx.get(followerRef),
      tx.get(followeeRef),
    ]);
    tx.set(doc(db, 'follows', followDocId(followerUid, followeeUid)), {
      followerUid,
      followeeUid,
      createdAt: serverTimestamp(),
    });
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
    // Same read-before-write ordering as followUser() above.
    const followerRef = doc(db, 'users', followerUid);
    const followeeRef = doc(db, 'users', followeeUid);
    const [followerSnap, followeeSnap] = await Promise.all([
      tx.get(followerRef),
      tx.get(followeeRef),
    ]);
    tx.delete(doc(db, 'follows', followDocId(followerUid, followeeUid)));
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

async function fetchConnections(uid: string): Promise<string[]> {
  const [followersSnap, followingSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followeeUid', '==', uid))),
    getDocs(query(collection(db, 'follows'), where('followerUid', '==', uid))),
  ]);
  const uids = new Set<string>();
  followersSnap.docs.forEach((d) => uids.add(d.data().followerUid));
  followingSnap.docs.forEach((d) => uids.add(d.data().followeeUid));
  return Array.from(uids);
}

/** Union of "people who follow me" and "people I follow" — the audience for
 * the trip invite picker (InviteFriendsSheet). No dedicated "friends"
 * concept exists beyond the follow graph, so this is it. */
export function useFollowConnections(uid: string | null) {
  return useQuery({
    queryKey: ['followConnections', uid],
    queryFn: () => fetchConnections(uid!),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
