import type { Comment, CommentReplyTo } from '@/types';

/**
 * Comment threads on a post — one level deep, like Instagram: a reply to a
 * reply joins the same thread under the top-level comment, but still names the
 * person it answers. Pure, so the post screen and its tests agree.
 */

/** The fields a reply to `target` carries. */
export function replyFieldsFor(target: Comment): { replyTo: CommentReplyTo } {
  return {
    replyTo: {
      commentId: target.id,
      rootId: target.replyTo?.rootId ?? target.id,
      authorUid: target.authorUid,
      authorName: target.authorDisplayName,
    },
  };
}

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

/**
 * Top-level comments in order, each with its replies in order. A reply whose
 * thread root was deleted stays visible, as a top-level comment where it fell
 * in the list (it still reads "@Ana", so it isn't confusing on its own).
 */
export function threadComments(comments: Comment[]): CommentThread[] {
  const ids = new Set(comments.map((c) => c.id));
  const threads: CommentThread[] = [];
  const byRoot = new Map<string, CommentThread>();
  for (const comment of comments) {
    const rootId = comment.replyTo?.rootId;
    const root = rootId && ids.has(rootId) ? byRoot.get(rootId) : undefined;
    if (root) {
      root.replies.push(comment);
      continue;
    }
    const thread = { comment, replies: [] };
    threads.push(thread);
    byRoot.set(comment.id, thread);
  }
  return threads;
}

export type CommentMenuAction = 'delete' | 'report' | 'block';

/**
 * The ⋯ menu on a comment. Someone else's: report and block — plus delete when
 * it's on your post. Your own comment has inline edit/delete instead.
 */
export function commentMenu(comment: Comment, uid: string, postAuthorUid: string): CommentMenuAction[] {
  if (!uid || comment.authorUid === uid) return [];
  return postAuthorUid === uid ? ['delete', 'report', 'block'] : ['report', 'block'];
}
