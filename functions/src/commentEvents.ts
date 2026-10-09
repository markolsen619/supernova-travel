import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { commentLikePushCopy } from './pushCopy';
import { notifyUser } from './notify';
import { commentInboxes } from './commentNotifications';

const db = admin.firestore();

/**
 * posts/{postId}/comments/{commentId}/likes/{uid} — tells the comment's author.
 * The like doc carries only { uid, createdAt }, so the liker's name comes from users/.
 */
export const onCommentLikeCreated = onDocumentCreated(
  'posts/{postId}/comments/{commentId}/likes/{likeId}',
  async (event) => {
    const like = event.data?.data();
    if (!like) return;
    const { postId, commentId } = event.params;
    const likerUid: string = like.uid;
    const commentSnap = await db.doc(`posts/${postId}/comments/${commentId}`).get();
    if (!commentSnap.exists) return;
    const comment = commentSnap.data()!;
    if (comment.authorUid === likerUid) return; // no self-notifications

    const liker = (await db.doc(`users/${likerUid}`).get()).data() ?? {};
    const likerName: string = liker.fullName ?? liker.displayName ?? 'A traveler';
    const text: string = comment.text ?? '';
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;

    await notifyUser(comment.authorUid, {
      notification: {
        type: 'comment_like',
        postId,
        commentId,
        commentText: preview,
        likerUid,
        likerName,
        likerAvatarUrl: liker.avatarUrl ?? null,
      },
      push: commentLikePushCopy(likerName, preview),
    });
  },
);

/**
 * A deleted comment — by its author, or by the post's author — takes its likes
 * and every notification about it. Replies to it stay; the app shows them at
 * the top level once their parent is gone.
 */
export const onCommentDeleted = onDocumentDeleted('posts/{postId}/comments/{commentId}', async (event) => {
  const comment = event.data?.data();
  if (!comment) return;
  const { postId, commentId } = event.params;
  const ref = db.doc(`posts/${postId}/comments/${commentId}`);

  const likes = await ref.collection('likes').get();
  const writes = db.bulkWriter();
  likes.docs.forEach((d) => writes.delete(d.ref));

  const post = (await db.doc(`posts/${postId}`).get()).data();
  const inboxes = commentInboxes({
    postAuthorUid: post?.authorUid ?? '',
    commentAuthorUid: comment.authorUid ?? '',
    replyToUid: typeof comment.replyTo?.authorUid === 'string' ? comment.replyTo.authorUid : null,
  });
  const snaps = await Promise.all(inboxes.map((uid) =>
    db.collection(`users/${uid}/notifications`).where('commentId', '==', commentId).get()));
  snaps.forEach((snap) => snap.docs.forEach((d) => writes.delete(d.ref)));
  await writes.close();
});
