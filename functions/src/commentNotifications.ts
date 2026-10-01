/**
 * Who hears about a comment — pure, no firebase-admin, unit-tested. The I/O is
 * in postEvents.ts (create) and commentEvents.ts (likes, delete).
 */

export type CommentNotificationType = 'post_comment' | 'comment_reply';

/**
 * A new comment tells the person it replies to (`comment_reply`) and the post
 * author (`post_comment`). Never yourself, and never twice: a reply to the
 * post author is just a reply.
 */
export function commentNotificationTargets(c: {
  postAuthorUid: string;
  commenterUid: string;
  replyToUid: string | null;
}): { uid: string; type: CommentNotificationType }[] {
  const out: { uid: string; type: CommentNotificationType }[] = [];
  if (c.replyToUid && c.replyToUid !== c.commenterUid) out.push({ uid: c.replyToUid, type: 'comment_reply' });
  if (c.postAuthorUid && c.postAuthorUid !== c.commenterUid && c.postAuthorUid !== c.replyToUid) {
    out.push({ uid: c.postAuthorUid, type: 'post_comment' });
  }
  return out;
}

/**
 * Every inbox that can hold a notification about one comment: the post
 * author (post_comment), the person it replied to (comment_reply), and its own
 * author (comment_like). Deleting the comment clears all three.
 */
export function commentInboxes(c: { postAuthorUid: string; commentAuthorUid: string; replyToUid: string | null }): string[] {
  return [...new Set([c.postAuthorUid, c.replyToUid, c.commentAuthorUid].filter((u): u is string => !!u))];
}
