import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { postStoragePaths, linkedPostsToDelete } from './postCleanup';

const db = admin.firestore();

/**
 * A deleted post takes everything that was only there because of it: its
 * comments and likes, the photos and videos it uploaded (publicly readable by
 * URL until removed — and Storage rules don't let the client delete them), the
 * like/comment notifications in its author's inbox, and copies other people
 * saved. Every step is idempotent, so a retry or an overlapping deleteAccount
 * run is harmless. Rules in postCleanup.ts.
 */
export const onPostDeleted = onDocumentDeleted('posts/{postId}', async (event) => {
  const { postId } = event.params;
  const post = event.data?.data();
  if (!post) return;
  const ref = db.doc(`posts/${postId}`);

  const [comments, likes] = await Promise.all([ref.collection('comments').get(), ref.collection('likes').get()]);
  await Promise.all([...comments.docs, ...likes.docs].map((d) => db.recursiveDelete(d.ref)));

  const bucket = admin.storage().bucket();
  await Promise.all(postStoragePaths(post as never).map((path) =>
    bucket.file(path).delete({ ignoreNotFound: true }).catch((err) => {
      console.error(`[onPostDeleted] couldn't delete ${path}:`, err);
    })));

  const writes = db.bulkWriter();
  if (typeof post.authorUid === 'string' && post.authorUid) {
    const notes = await db.collection(`users/${post.authorUid}/notifications`).where('postId', '==', postId).get();
    notes.docs.forEach((d) => writes.delete(d.ref));
  }
  // Saved copies of a photo post (doc id = post id). A saved *trip* is keyed by
  // the trip and outlives the post that shared it.
  try {
    const saved = await db.collectionGroup('savedTrips').where('postId', '==', postId).get();
    saved.docs.forEach((d) => writes.delete(d.ref));
  } catch (err) {
    // Needs the savedTrips.postId collection-group index; never let it block the rest.
    console.error('[onPostDeleted] saved copies not removed:', err);
  }
  await writes.close();
});

/** A deleted trip takes its owner's feed posts about it; each then cleans up via onPostDeleted. */
export const onTripDeletedRemovePosts = onDocumentDeleted('trips/{tripId}', async (event) => {
  const trip = event.data?.data();
  if (!trip) return;
  const posts = await db.collection('posts').where('tripId', '==', event.params.tripId).get();
  const ids = linkedPostsToDelete(posts.docs.map((d) => ({ id: d.id, authorUid: d.data().authorUid })), trip.authorUid);
  await Promise.all(ids.map((id) => db.doc(`posts/${id}`).delete()));
});
