import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useModerationStore } from '@/stores/useModerationStore';
import {
  buildReport,
  canModerate,
  contentKey,
  reportDocId,
  type ReportReason,
  type ReportTarget,
} from '@/utils/moderation';

/**
 * Reads the user's blocks and reported-content list into useModerationStore.
 * Called from hydrateSession without awaiting: until it lands, lists render
 * unfiltered, which beats holding sign-in on two extra reads.
 */
export async function loadModerationState(uid: string): Promise<void> {
  try {
    const [blocked, hidden] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'blocked')),
      getDocs(collection(db, 'users', uid, 'hidden')),
    ]);
    useModerationStore.getState().setAll({
      blockedUids: blocked.docs.map((d) => d.id),
      hiddenKeys: hidden.docs.map((d) => d.id),
    });
  } catch (error) {
    console.warn('[moderation] failed to load blocks and hidden content:', error);
  }
}

/**
 * Files a report and hides the content for the reporter straight away.
 * functions/src/onReportCreated.ts alerts moderators and auto-hides content
 * that several people report.
 *
 * A repeat report of the same thing is a no-op: the report id is
 * deterministic and the rules refuse to overwrite it.
 */
export async function submitReport(
  reporterUid: string,
  target: ReportTarget,
  reason: ReportReason,
  details?: string,
): Promise<void> {
  if (!canModerate(reporterUid, target.ownerUid)) {
    throw new Error("You can't report your own content.");
  }
  const key = contentKey(target);
  const store = useModerationStore.getState();
  if (store.hiddenKeys.includes(key)) return;

  await setDoc(doc(db, 'reports', reportDocId(reporterUid, target)), {
    ...buildReport(reporterUid, target, reason, details),
    createdAt: serverTimestamp(),
  });

  store.addHidden(key);
  // Best effort: the report is what matters. If this write fails, the item
  // is still hidden for the rest of the session.
  setDoc(doc(db, 'users', reporterUid, 'hidden', key), { createdAt: serverTimestamp() }).catch(
    (error) => console.warn('[moderation] failed to persist hidden content:', error),
  );
}

/** Query keys whose data changes when a block removes follows between two people. */
function invalidateRelationship(queryClient: QueryClient | undefined, myUid: string, otherUid: string) {
  if (!queryClient) return;
  for (const queryKey of [
    ['isFollowing', myUid, otherUid],
    ['userProfile', myUid],
    ['userProfile', otherUid],
    ['followConnections', myUid],
    ['isFriend'],
    ['dmThreads'],
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Blocks someone. Their content disappears for the blocker immediately;
 * functions/src/onBlockCreated.ts then removes follows in both directions,
 * and firestore.rules stop them following, commenting on the blocker's
 * posts, or messaging them.
 */
export async function blockUser(myUid: string, otherUid: string, queryClient?: QueryClient): Promise<void> {
  if (!canModerate(myUid, otherUid)) throw new Error("You can't block yourself.");
  useModerationStore.getState().addBlocked(otherUid);
  try {
    await setDoc(doc(db, 'users', myUid, 'blocked', otherUid), { createdAt: serverTimestamp() });
  } catch (error) {
    useModerationStore.getState().removeBlocked(otherUid);
    throw error;
  }
  invalidateRelationship(queryClient, myUid, otherUid);
}

export async function unblockUser(myUid: string, otherUid: string, queryClient?: QueryClient): Promise<void> {
  useModerationStore.getState().removeBlocked(otherUid);
  try {
    await deleteDoc(doc(db, 'users', myUid, 'blocked', otherUid));
  } catch (error) {
    useModerationStore.getState().addBlocked(otherUid);
    throw error;
  }
  invalidateRelationship(queryClient, myUid, otherUid);
}
