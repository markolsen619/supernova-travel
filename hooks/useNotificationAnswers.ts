import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { followRequestAnswer, inviteAnswer, readFailure, type ServerAnswers } from '@/utils/notificationActions';
import type { AppNotification } from '@/types';

/** A doc the rules hide once it is gone (followRequests) reads as permission-denied: that alone means missing. */
async function exists(path: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, path))).exists();
  } catch (e) {
    if (readFailure(e) === 'missing') return false;
    throw e;
  }
}

async function answerFor(n: AppNotification, uid: string): Promise<[string, ServerAnswers[string]]> {
  if (n.type === 'trip_invite') {
    try {
      const snap = await getDoc(doc(db, 'trips', n.tripId, 'invites', uid));
      const status = snap.exists() ? (snap.data().status as 'pending' | 'accepted' | 'declined') : 'missing';
      return [n.id, inviteAnswer(status)];
    } catch (e) {
      if (readFailure(e) === 'missing') return [n.id, inviteAnswer('missing')];
      throw e;
    }
  }
  // follow_request: profileUid is the requester.
  const req = n as AppNotification & { type: 'follow_request' };
  const [requestExists, theyFollow] = await Promise.all([
    exists(`followRequests/${req.profileUid}_${uid}`),
    exists(`follows/${req.profileUid}_${uid}`),
  ]);
  return [n.id, followRequestAnswer({ requestExists, theyFollow })];
}

/**
 * Whether each trip invite / follow request row was already answered, read from the server so the
 * Accept/Decline buttons stay gone after the screen remounts. One small read per such row (rare).
 */
export function useNotificationAnswers(notifications: AppNotification[]) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const rows = notifications.filter((n) => n.type === 'trip_invite' || n.type === 'follow_request');
  return useQuery({
    queryKey: ['notificationAnswers', uid, rows.map((n) => n.id).join(',')],
    queryFn: async () => Object.fromEntries(await Promise.all(rows.map((n) => answerFor(n, uid)))) as ServerAnswers,
    enabled: !!uid && rows.length > 0,
    staleTime: 30 * 1000,
  });
}
