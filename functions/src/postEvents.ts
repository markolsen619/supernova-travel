import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { notifyUser } from './notify';

const db = admin.firestore();

function coverUrlFor(post: FirebaseFirestore.DocumentData): string | null {
  if (post.mediaType === 'photo') return post.mediaUrl ?? null;
  return post.thumbnailUrl ?? null;
}

/** posts/{postId}/likes/{likeId} — the like doc only carries { uid,
 * createdAt } (see components/feed/FeedActions.tsx), so the liker's
 * name/avatar need a users/ lookup here. */
export const onLikeCreated = onDocumentCreated(
  'posts/{postId}/likes/{likeId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { postId } = event.params;
    const likerUid: string = snap.data().uid;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const post = postSnap.data()!;
    if (post.authorUid === likerUid) return; // no self-notifications

    const likerDoc = await db.doc(`users/${likerUid}`).get();
    const likerData = likerDoc.data() ?? {};
    const likerName: string = likerData.fullName ?? likerData.displayName ?? 'A traveler';

    await notifyUser(post.authorUid, {
      notification: {
        type: 'post_like',
        postId,
        postCoverUrl: coverUrlFor(post),
        likerUid,
        likerName,
        likerAvatarUrl: likerData.avatarUrl ?? null,
      },
      push: {
        title: 'New like',
        body: `${likerName} liked your post`,
      },
    });
  },
);

/** posts/{postId}/comments/{commentId} — the comment doc already carries
 * authorDisplayName/authorAvatarUrl (see the Comment type), so no extra
 * users/ lookup is needed here, unlike likes. */
export const onCommentCreated = onDocumentCreated(
  'posts/{postId}/comments/{commentId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { postId } = event.params;
    const comment = snap.data();
    const commenterUid: string = comment.authorUid;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const post = postSnap.data()!;
    if (post.authorUid === commenterUid) return; // no self-notifications

    const text: string = comment.text ?? '';
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const commenterName: string = comment.authorDisplayName ?? 'A traveler';

    await notifyUser(post.authorUid, {
      notification: {
        type: 'post_comment',
        postId,
        postCoverUrl: coverUrlFor(post),
        commentText: preview,
        commenterUid,
        commenterName,
        commenterAvatarUrl: comment.authorAvatarUrl ?? null,
      },
      push: {
        title: 'New comment',
        body: `${commenterName}: ${preview}`,
      },
    });
  },
);
