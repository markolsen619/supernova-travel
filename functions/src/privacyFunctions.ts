import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { notifyUser } from './notify';
import { followRequestId, privacyTransition, postVisibilityOnCreate } from './privacy';

const db = admin.firestore();
const isPrivate = (u: FirebaseFirestore.DocumentData | undefined) => u?.settings?.privacy === 'private';

/** Creates follower→followee once (no-op if it exists), keeping both counts right. */
async function createFollow(followerUid: string, followeeUid: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const followRef = db.doc(`follows/${followerUid}_${followeeUid}`);
    const [follow, follower, followee] = await Promise.all([
      tx.get(followRef), tx.get(db.doc(`users/${followerUid}`)), tx.get(db.doc(`users/${followeeUid}`)),
    ]);
    tx.delete(db.doc(`followRequests/${followRequestId(followerUid, followeeUid)}`));
    if (follow.exists || !follower.exists || !followee.exists) return false;
    tx.set(followRef, { followerUid, followeeUid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(follower.ref, { followingCount: (follower.data()?.followingCount ?? 0) + 1 });
    tx.update(followee.ref, { followersCount: (followee.data()?.followersCount ?? 0) + 1 });
    return true;
  });
}

async function notifyAccepted(requesterUid: string, targetUid: string) {
  const t = (await db.doc(`users/${targetUid}`).get()).data() ?? {};
  const name = t.fullName ?? t.displayName ?? 'A traveler';
  await notifyUser(requesterUid, {
    notification: { type: 'follow_accepted', profileUid: targetUid, accepterName: name, accepterAvatarUrl: t.avatarUrl ?? null },
    push: { title: 'Request accepted', body: `${name} accepted your follow request` },
  });
}

export const onFollowRequestCreated = onDocumentCreated('followRequests/{id}', async (event) => {
  const r = event.data?.data();
  if (!r) return;
  await notifyUser(r.targetUid, {
    notification: { type: 'follow_request', profileUid: r.requesterUid, requesterName: r.requesterName ?? 'A traveler', requesterAvatarUrl: r.requesterAvatarUrl ?? null },
    push: { title: 'Follow request', body: `${r.requesterName ?? 'Someone'} wants to follow you` },
  });
});

export const respondToFollowRequest = onCall(async (req) => {
  const targetUid = req.auth?.uid;
  if (!targetUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { requesterUid, accept } = (req.data ?? {}) as { requesterUid?: string; accept?: boolean };
  if (typeof requesterUid !== 'string' || !requesterUid || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'requesterUid and accept are required.');
  const reqRef = db.doc(`followRequests/${followRequestId(requesterUid, targetUid)}`);
  if (!(await reqRef.get()).exists) return { status: 'gone' };
  // The request notification is answered either way.
  const notes = await db.collection(`users/${targetUid}/notifications`).where('type', '==', 'follow_request').where('profileUid', '==', requesterUid).get();
  await Promise.all(notes.docs.map((d) => d.ref.delete()));
  if (!accept) { await reqRef.delete(); return { status: 'declined' }; }
  if (await createFollow(requesterUid, targetUid)) await notifyAccepted(requesterUid, targetUid);
  return { status: 'accepted' };
});

/** Going private flips public trips/posts to followers; going public restores them and approves every pending request. */
export const onUserPrivacyChanged = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || isPrivate(before) === isPrivate(after)) return;
  const { uid } = event.params;
  const toPrivate = isPrivate(after);
  for (const [col, field] of [['trips', 'authorUid'], ['posts', 'authorUid']] as const) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    const changes = privacyTransition(toPrivate, snap.docs.map((d) => ({ id: d.id, ...d.data() } as never)));
    const w = db.bulkWriter();
    changes.forEach((c) => w.update(db.doc(`${col}/${c.id}`), { visibility: c.visibility, publicWhenAccountPublic: c.publicWhenAccountPublic }));
    await w.close();
  }
  if (!toPrivate) {
    const pending = await db.collection('followRequests').where('targetUid', '==', uid).get();
    for (const p of pending.docs) {
      if (await createFollow(p.data().requesterUid, uid)) await notifyAccepted(p.data().requesterUid, uid);
    }
  }
});

/** Posts from apps up to 1.0.2 have no visibility; a private author's posts start followers-only. */
export const onPostCreatedVisibility = onDocumentCreated('posts/{postId}', async (event) => {
  const post = event.data?.data();
  if (!post) return;
  const author = (await db.doc(`users/${post.authorUid}`).get()).data();
  const next = postVisibilityOnCreate(post, isPrivate(author));
  if (next) await event.data!.ref.update({ visibility: next, ...(next === 'followers' && post.visibility !== 'followers' ? { publicWhenAccountPublic: true } : {}) });
});
