import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  NOTIFICATION_ACTOR_FIELDS,
  OWNER_UID_COLLECTIONS,
  decrementCount,
  invitedTripIds,
  threadRemoval,
  userStoragePrefixes,
} from './accountDeletion';

/**
 * Permanently deletes the caller's account and everything tied to it.
 * App Store guideline 5.1.1(v): an app that lets people create an account
 * must let them delete it from inside the app.
 *
 * Order matters:
 *  1. Traces in other people's data (likes, comments, notifications, follows,
 *     collaborator slots, invites, DMs), while the user's own notifications
 *     still exist to find their pending invites.
 *  2. The user's own content and profile. Deleting trips and users/{uid}
 *     fires the Algolia triggers, which drop them from search.
 *  3. Uploaded files and the RevenueCat customer record.
 *  4. The Firebase Auth user, last. Until then the caller is still signed
 *     in, so if any step throws they can simply try again. Every step reads
 *     what's left rather than assuming, which is what makes a retry safe.
 *
 * It does not cancel an App Store subscription. Only the user can, which is
 * why the client warns first (app/settings/account.tsx).
 */

const REVENUECAT_SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY ?? '';

type Db = admin.firestore.Firestore;

async function deleteDocs(db: Db, refs: admin.firestore.DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;
  const writer = db.bulkWriter();
  for (const ref of refs) writer.delete(ref);
  await writer.close();
}

async function recursiveDeleteAll(db: Db, refs: admin.firestore.DocumentReference[]): Promise<void> {
  for (const ref of refs) await db.recursiveDelete(ref);
}

/** Likes on other people's posts, and those posts' like counts. */
async function removeLikes(db: Db, uid: string): Promise<void> {
  const likes = await db.collectionGroup('likes').where('uid', '==', uid).get();
  for (const like of likes.docs) {
    const postRef = like.ref.parent.parent;
    await db.runTransaction(async (tx) => {
      const post = postRef ? await tx.get(postRef) : null;
      if (postRef && post?.exists) {
        tx.update(postRef, { likesCount: decrementCount(post.data()?.likesCount) });
      }
      tx.delete(like.ref);
    });
  }
}

/** Notifications in other users' inboxes that carry this user's name and avatar. */
async function removeActorNotifications(db: Db, uid: string): Promise<void> {
  for (const field of NOTIFICATION_ACTOR_FIELDS) {
    const snap = await db.collectionGroup('notifications').where(field, '==', uid).get();
    await deleteDocs(db, snap.docs.map((d) => d.ref));
  }
}

/** Both directions of the follow graph, keeping the other side's counts right. */
async function removeFollows(db: Db, uid: string): Promise<void> {
  const [following, followers] = await Promise.all([
    db.collection('follows').where('followerUid', '==', uid).get(),
    db.collection('follows').where('followeeUid', '==', uid).get(),
  ]);

  const edges = [
    ...following.docs.map((d) => ({ ref: d.ref, otherUid: d.data().followeeUid, field: 'followersCount' })),
    ...followers.docs.map((d) => ({ ref: d.ref, otherUid: d.data().followerUid, field: 'followingCount' })),
  ];

  for (const edge of edges) {
    await db.runTransaction(async (tx) => {
      const otherRef = typeof edge.otherUid === 'string' ? db.doc(`users/${edge.otherUid}`) : null;
      const other = otherRef ? await tx.get(otherRef) : null;
      if (otherRef && other?.exists) {
        tx.update(otherRef, { [edge.field]: decrementCount(other.data()?.[edge.field]) });
      }
      tx.delete(edge.ref);
    });
  }
}

/** Collaborator slots and invites on trips this user doesn't own. */
async function removeFromOthersTrips(db: Db, uid: string, pendingInviteTripIds: string[]): Promise<void> {
  const collaborating = await db.collection('trips').where('collaborators', 'array-contains', uid).get();
  const inviteRefs = new Map<string, admin.firestore.DocumentReference>();

  for (const trip of collaborating.docs) {
    await trip.ref.update({ collaborators: admin.firestore.FieldValue.arrayRemove(uid) });
    inviteRefs.set(trip.id, trip.ref.collection('invites').doc(uid));
  }
  for (const tripId of pendingInviteTripIds) {
    inviteRefs.set(tripId, db.doc(`trips/${tripId}/invites/${uid}`));
  }

  const sent = await db.collectionGroup('invites').where('inviterUid', '==', uid).get();
  await deleteDocs(db, [...inviteRefs.values(), ...sent.docs.map((d) => d.ref)]);
}

/** Messages this user sent, their read cursors, and threads left with no one. */
async function removeFromThreads(db: Db, uid: string): Promise<void> {
  const threads = await db.collection('dmThreads').where('participants', 'array-contains', uid).get();

  for (const thread of threads.docs) {
    const data = thread.data();
    const decision = threadRemoval(data.participants ?? [], data.lastMessageSenderUid, uid);

    if (decision.kind === 'delete-thread') {
      await db.recursiveDelete(thread.ref);
      continue;
    }

    const sent = await thread.ref.collection('messages').where('senderUid', '==', uid).get();
    await deleteDocs(db, [...sent.docs.map((d) => d.ref), thread.ref.collection('reads').doc(uid)]);
    await thread.ref.update({
      participants: decision.participants,
      ...(decision.clearPreview
        ? { lastMessageText: null, lastMessageSenderUid: null }
        : {}),
    });
  }
}

/** Everything the user owns outright. */
async function removeOwnContent(db: Db, uid: string): Promise<void> {
  const [posts, trips, usernames, ...owned] = await Promise.all([
    db.collection('posts').where('authorUid', '==', uid).get(),
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('usernames').where('uid', '==', uid).get(),
    ...OWNER_UID_COLLECTIONS.map((c) => db.collection(c).where('ownerUid', '==', uid).get()),
  ]);

  // Comments on other people's posts. Comments on the user's own posts go
  // with those posts below.
  const comments = await db.collectionGroup('comments').where('authorUid', '==', uid).get();
  await deleteDocs(db, comments.docs.map((d) => d.ref));

  await recursiveDeleteAll(db, [...posts.docs, ...trips.docs].map((d) => d.ref));
  await deleteDocs(db, [
    ...usernames.docs.map((d) => d.ref),
    ...owned.flatMap((snap) => snap.docs.map((d) => d.ref)),
    db.doc(`usage_quotas/${uid}`),
  ]);

  // Last in Firestore: feed, notifications, and savedTrips go with it.
  await db.recursiveDelete(db.doc(`users/${uid}`));
}

async function removeStorage(uid: string): Promise<void> {
  const bucket = admin.storage().bucket();
  for (const prefix of userStoragePrefixes(uid)) {
    await bucket.deleteFiles({ prefix, force: true });
  }
}

/**
 * Deletes the RevenueCat customer and its purchase history. Best effort: a
 * failure here is logged, not thrown, because nothing about it should keep
 * someone from deleting their account.
 */
async function removeRevenueCatCustomer(uid: string): Promise<void> {
  if (!REVENUECAT_SECRET_API_KEY) {
    functions.logger.warn('[deleteAccount] REVENUECAT_SECRET_API_KEY not set; RevenueCat customer kept', { uid });
    return;
  }
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}` },
    });
    if (!res.ok && res.status !== 404) {
      functions.logger.error('[deleteAccount] RevenueCat customer delete failed', { uid, status: res.status });
    }
  } catch (error) {
    functions.logger.error('[deleteAccount] RevenueCat customer delete failed', { uid, error });
  }
}

export const deleteAccount = functions.https.onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '512MiB' },
  async (request): Promise<{ deleted: true }> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    try {
      const ownNotifications = await db.collection(`users/${uid}/notifications`).where('type', '==', 'trip_invite').get();
      const pendingInviteTripIds = invitedTripIds(ownNotifications.docs.map((d) => d.data()));

      await removeLikes(db, uid);
      await removeActorNotifications(db, uid);
      await removeFollows(db, uid);
      await removeFromOthersTrips(db, uid, pendingInviteTripIds);
      await removeFromThreads(db, uid);
      await removeOwnContent(db, uid);
      await removeStorage(uid);
      await removeRevenueCatCustomer(uid);

      await admin.auth().deleteUser(uid).catch((error: { code?: string }) => {
        // Already gone from a previous attempt that failed after this point.
        if (error.code !== 'auth/user-not-found') throw error;
      });
    } catch (error) {
      functions.logger.error('[deleteAccount] failed partway; safe to retry', { uid, error });
      throw new functions.https.HttpsError('internal', 'Account deletion did not finish');
    }

    functions.logger.info('[deleteAccount] account deleted', { uid });
    return { deleted: true };
  },
);
