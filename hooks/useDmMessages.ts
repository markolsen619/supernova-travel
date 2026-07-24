import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DmMessage } from '@/types';

/** Real-time message list for one open thread — the app's second
 * onSnapshot exception (the first is post comments in app/post/[id].tsx),
 * for the same reason: a chat that isn't live defeats the point. */
export function useDmMessages(threadId: string | null) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    const q = query(collection(db, 'dmThreads', threadId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DmMessage));
      setLoading(false);
    });
    return unsub;
  }, [threadId]);

  return { messages, loading };
}

/** Sends a message via a direct client addDoc — no callable needed, the
 * messages `create` rule alone enforces "must be a participant, must be
 * the sender." onMessageCreated (Cloud Function) handles the fan-out:
 * updating the thread's lastMessage* fields and pushing the recipients. */
export function useSendDmMessage(threadId: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!threadId || !uid || !trimmed) return;
      await addDoc(collection(db, 'dmThreads', threadId, 'messages'), {
        senderUid: uid,
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    },
    [threadId, uid],
  );
}
