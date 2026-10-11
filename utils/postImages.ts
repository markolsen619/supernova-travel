/**
 * Every photo of a post, in order. Multi-photo posts carry `mediaUrls`; posts
 * from before that only have `mediaUrl`. Shared by the feed card, the post
 * screen and the profile grid so none of them shows just the first photo.
 */
export function postImageUrls(post: { mediaUrls?: string[] | null; mediaUrl?: string | null }): string[] {
  const urls = post.mediaUrls?.filter(Boolean) ?? [];
  if (urls.length) return urls;
  return post.mediaUrl ? [post.mediaUrl] : [];
}

/** A post's grid tile: a video is shown by its cover, never by its mp4 (an Image can't draw one). */
export function gridImageUrl(post: { mediaType?: string; mediaUrl?: string | null; thumbnailUrl?: string | null }): string | null {
  if (post.mediaType === 'video') return post.thumbnailUrl ?? null;
  return post.mediaUrl ?? null;
}
