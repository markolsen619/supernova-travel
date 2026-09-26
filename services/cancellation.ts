import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { buildCancellationFeedback } from '@/utils/cancellation';

/**
 * Records why someone cancelled, on their way to the Customer Center.
 *
 * Fire-and-forget and never throws. A failed write must not stand between a
 * user and cancelling their subscription — the feedback is ours to lose, not
 * theirs. Anything that could delay or block the handoff belongs nowhere near
 * this path.
 *
 * Writes to a top-level `cancellation_feedback` collection: create-only from
 * the client, unreadable by it (see firestore.rules), the same shape as
 * `reports`. Nobody reads this in the app; it is for us in the console.
 */
export function recordCancellationFeedback({
  tier,
  reason,
  note,
}: {
  tier: string;
  reason: string | null;
  note: string;
}): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  addDoc(collection(db, 'cancellation_feedback'), {
    ...buildCancellationFeedback({ uid, tier, reason, note }),
    createdAt: serverTimestamp(),
  }).catch((error) => {
    console.warn('[cancellation] feedback write failed:', error);
  });
}
