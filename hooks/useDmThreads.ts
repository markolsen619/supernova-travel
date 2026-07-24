import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db, functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function fetchDmThreads(uid: string): Promise<Array<DmThread & { unread: boolean }>> {
  const snap = await getDocs(
    query(
      collection(db, 'dmThreads'),
      where('participants', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc'),
    ),
  );
  const threads = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DmThread);

  const readCursors = await Promise.all(
    threads.map((t) => getDoc(doc(db, 'dmThreads', t.id, 'reads', uid))),
  );

  return threads.map((thread, i) => {
    const lastReadAt = readCursors[i].data()?.lastReadAt;
    return {
      ...thread,
      unread: isThreadUnread(thread, uid, lastReadAt ? lastReadAt.toMillis() : null),
    };
  });
}

/** All DM threads I'm a participant in, newest activity first, each
 * annotated with whether I've read past its last message. Powers the
 * Messages tab in app/notifications.tsx. */
export function useDmThreads() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['dmThreads', uid],
    queryFn: () => fetchDmThreads(uid!),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

async function fetchDmThread(threadId: string): Promise<DmThread | null> {
  const snap = await getDoc(doc(db, 'dmThreads', threadId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as DmThread) : null;
}

/** Single thread doc — powers the chat screen's header (participants, type). */
export function useDmThread(threadId: string | null) {
  return useQuery({
    queryKey: ['dmThread', threadId],
    queryFn: () => fetchDmThread(threadId!),
    enabled: !!threadId,
    staleTime: 60 * 1000,
  });
}

interface CreateDmThreadResult {
  threadId: string;
  isNew: boolean;
}

/** Starts (or resolves an existing) DM thread via the createDmThread Cloud
 * Function — friendship validation against a variable-length participant
 * list can't be expressed in Firestore rules, so thread creation is
 * Admin-SDK-only (see firestore.rules `dmThreads` create/update: if false). */
export function useCreateDmThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantUids: string[]) => {
      const fn = httpsCallable<{ participantUids: string[] }, CreateDmThreadResult>(
        functions,
        'createDmThread',
      );
      return fn({ participantUids }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmThreads'] });
    },
  });
}
