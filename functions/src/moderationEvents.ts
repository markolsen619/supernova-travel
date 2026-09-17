import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sendPushNotification } from './notify';
import { autoHidePath, moderatorPush, parseModeratorUids, shouldAutoHide } from './moderation';
import { decrementCount } from './accountDeletion';

const db = admin.firestore();

/** Whether either person has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    db.doc(`users/${a}/blocked/${b}`).get(),
    db.doc(`users/${b}/blocked/${a}`).get(),
  ]);
  return ab.exists || ba.exists;
}

/**
 * A new report. Tells moderators straight away, which is how the 24-hour
 * review promised in the app and the Terms of Use is kept (docs/moderation.md),
 * and hides posts, comments, and trips for everyone once enough different
 * people have reported them.
 */
export const onReportCreated = onDocumentCreated(
  { document: 'reports/{reportId}', region: 'us-central1' },
  async (event) => {
    const report = event.data?.data();
    if (!report) return;

    const count = (
      await db.collection('reports').where('targetKey', '==', report.targetKey).count().get()
    ).data().count;

    const path = autoHidePath(report);
    if (path && shouldAutoHide(count)) {
      const ref = db.doc(path);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.moderationHidden !== true) {
        await ref.update({
          moderationHidden: true,
          moderationHiddenAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.warn('[moderation] auto-hidden after reports', { path, count });
      }
    }

    const moderators = parseModeratorUids(process.env.MODERATOR_UIDS);
    if (moderators.length === 0) {
      // Loud on purpose: with no moderators, nobody hears about reports.
      functions.logger.error('[moderation] MODERATOR_UIDS is not set; report not delivered to anyone', {
        reportId: event.params.reportId,
      });
      return;
    }

    const moderatorDocs = await Promise.all(moderators.map((uid) => db.doc(`users/${uid}`).get()));
    const tokens = moderatorDocs.flatMap((d) => (d.data()?.expoPushTokens as string[] | undefined) ?? []);
    const { title, body } = moderatorPush(report, count);
    await sendPushNotification(tokens, title, body);
    functions.logger.info('[moderation] report received', {
      reportId: event.params.reportId,
      targetType: report.targetType,
      reason: report.reason,
      count,
    });
  },
);

/**
 * A block. Removes follows in both directions, keeping the other side's
 * counts right; the client can't, since the rules only let you remove your
 * own follow. firestore.rules then stop either of them following again.
 */
export const onBlockCreated = onDocumentCreated(
  { document: 'users/{uid}/blocked/{blockedUid}', region: 'us-central1' },
  async (event) => {
    const { uid, blockedUid } = event.params;
    if (uid === blockedUid) return;

    const edges = [
      { id: `${uid}_${blockedUid}`, follower: uid, followee: blockedUid },
      { id: `${blockedUid}_${uid}`, follower: blockedUid, followee: uid },
    ];

    for (const edge of edges) {
      await db.runTransaction(async (tx) => {
        const followRef = db.doc(`follows/${edge.id}`);
        const followerRef = db.doc(`users/${edge.follower}`);
        const followeeRef = db.doc(`users/${edge.followee}`);
        const [follow, follower, followee] = await Promise.all([
          tx.get(followRef),
          tx.get(followerRef),
          tx.get(followeeRef),
        ]);
        if (!follow.exists) return;
        tx.delete(followRef);
        if (follower.exists) tx.update(followerRef, { followingCount: decrementCount(follower.data()?.followingCount) });
        if (followee.exists) tx.update(followeeRef, { followersCount: decrementCount(followee.data()?.followersCount) });
      });
    }
  },
);
