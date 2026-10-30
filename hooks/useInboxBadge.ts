import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function counts(uid: string): Promise<{ messages: number; notifications: number }> {
  const [notifs, threads, user] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'notifications'), where('read', '==', false), limit(10))),
    getDocs(query(collection(db, 'dmThreads'), where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc'), limit(10))),
    getDoc(doc(db, 'users', uid)),
  ]);
  const seen = user.data()?.lastMessagesSeenAt;
  const seenMs = seen ? seen.toMillis() : null;
  const messages = threads.docs.filter((t) => isThreadUnread(t.data() as DmThread, uid, seenMs)).length;
  return { messages, notifications: notifs.size };
}

/** Unread messages and notifications for Home's Inbox button (spec 2026-10-29). Same queries as useHasUnreadActivity, counted (≤ 10 each). */
export function useInboxBadge(): { messages: number; notifications: number; total: number } {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { data } = useQuery({ queryKey: ['inboxBadge', uid], queryFn: () => counts(uid), enabled: !!uid, staleTime: 30 * 1000 });
  const messages = data?.messages ?? 0;
  const notifications = data?.notifications ?? 0;
  return { messages, notifications, total: messages + notifications };
}
