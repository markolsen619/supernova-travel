import type { Post } from '@/types';

/**
 * What you can do with a post you're looking at — pure, so the feed card, the
 * post screen and their tests agree. Someone else's post keeps Report / Block
 * (components/moderation/useContentActions).
 */
export type OwnPostAction = 'edit' | 'delete';

/** Edit and delete on your own post; nothing extra on anyone else's. */
export function ownPostMenu(post: Pick<Post, 'authorUid'>, uid: string): OwnPostAction[] {
  return uid && post.authorUid === uid ? ['edit', 'delete'] : [];
}

/**
 * The delete confirmation. A trip post only shares the trip, so say the trip
 * stays; a photo or video post takes its media with it (onPostDeleted removes
 * the files), so say that.
 */
export function deletePostConfirm(post: Pick<Post, 'mediaType'>): { title: string; message: string } {
  const title = 'Delete this post?';
  if (post.mediaType === 'trip') return { title, message: 'Your trip stays. Only this post is removed from the feed.' };
  const media = post.mediaType === 'video' ? 'video' : 'photos';
  return { title, message: `Its ${media}, likes and comments are deleted too. This can't be undone.` };
}

/** A double tap on the feed toggles the like; the burst shows which way it went. */
export function doubleTapLike(liked: boolean): { liked: boolean; burst: 'like' | 'unlike' } {
  return liked ? { liked: false, burst: 'unlike' } : { liked: true, burst: 'like' };
}
