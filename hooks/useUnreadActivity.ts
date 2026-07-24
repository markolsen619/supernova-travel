import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function checkUnreadActivity(uid: string): Promise<boolean> {
  const unreadNotifSnap = await getDocs(
    query(collection(db, 'users', uid, 'notifications'), where('read', '==', false), limit(1)),
  );
  if (!unreadNotifSnap.empty) return true;

  const [latestThreadSnap, userSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'dmThreads'),
        where('participants', 'array-contains', uid),
        orderBy('lastMessageAt', 'desc'),
        limit(1),
      ),
    ),
    getDoc(doc(db, 'users', uid)),
  ]);
  if (latestThreadSnap.empty) return false;

  const thread = latestThreadSnap.docs[0].data() as DmThread;
  const lastSeenAt = userSnap.data()?.lastMessagesSeenAt;
  return isThreadUnread(thread, uid, lastSeenAt ? lastSeenAt.toMillis() : null);
}

/** Drives the feed header's heart-icon badge dot — true if there's any
 * unread notification OR the most recent DM thread has activity I haven't
 * seen. Two small, cheap, indexed queries; no N+1 over every thread. */
export function useHasUnreadActivity() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['hasUnreadActivity', uid],
    queryFn: () => checkUnreadActivity(uid),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

/** Marks "you've seen the Messages tab as of now" — called when that tab
 * gains focus. This is only the coarse badge signal; per-thread read state
 * for the inbox's own unread dots lives separately in
 * dmThreads/{id}/reads/{uid} (see useDmThreads.ts). */
export function useMarkMessagesSeen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await updateDoc(doc(db, 'users', uid), { lastMessagesSeenAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity', uid] });
    },
  });
}
