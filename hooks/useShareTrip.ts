import { useCallback, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateDmThread } from '@/hooks/useDmThreads';
import { summarizeSends, tripMessagePayload, type ShareRecipient, type ShareableTrip } from '@/utils/tripShare';

/**
 * Sends a trip to each recipient as its own message, creating the
 * one-to-one conversation first where there isn't one (createDmThread checks
 * the mutual follow). One failure doesn't stop the rest; the summary names it.
 */
export function useShareTrip() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const createThread = useCreateDmThread();
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (recipients: (ShareRecipient & { name: string })[], trip: ShareableTrip, note: string) => {
      setSending(true);
      const results: { uid: string; name: string; ok: boolean }[] = [];
      try {
        for (const r of recipients) {
          try {
            const threadId = r.threadId ?? (await createThread.mutateAsync([r.uid])).threadId;
            await addDoc(collection(db, 'dmThreads', threadId, 'messages'), {
              ...tripMessagePayload({ trip, note, senderUid: uid }),
              createdAt: serverTimestamp(),
            });
            results.push({ uid: r.uid, name: r.name, ok: true });
          } catch (err) {
            console.warn('share trip: send failed', err);
            results.push({ uid: r.uid, name: r.name, ok: false });
          }
        }
      } finally {
        setSending(false);
        queryClient.invalidateQueries({ queryKey: ['dmThreads'] });
      }
      return { ...summarizeSends(results), failedUids: results.filter((x) => !x.ok).map((x) => x.uid) };
    },
    [uid, createThread, queryClient],
  );

  return { send, sending };
}
