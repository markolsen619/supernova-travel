/**
 * What deleting a post must also remove — pure decisions, no firebase-admin,
 * so they're unit-tested. The I/O lives in postCleanupFunctions.ts.
 */

interface PostMedia {
  authorUid: string;
  mediaUrls?: string[] | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
}

/** The object path inside a Firebase Storage download URL, or null for any other URL. */
function storagePathOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'firebasestorage.googleapis.com') return null;
    const m = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * The Storage files this post uploaded: the author's own `posts/{uid}/…`
 * objects named by its media fields. Anything else — another user's file, the
 * author's avatar, a Google Places photo on a trip post, a path with `..` — is
 * not this post's to delete.
 */
export function postStoragePaths(post: PostMedia): string[] {
  if (!post.authorUid) return [];
  const prefix = `posts/${post.authorUid}/`;
  const urls = [...(post.mediaUrls ?? []), post.mediaUrl, post.thumbnailUrl];
  const paths = new Set<string>();
  for (const url of urls) {
    const path = storagePathOf(url);
    if (!path || !path.startsWith(prefix) || path.includes('..') || path.length === prefix.length) continue;
    paths.add(path);
  }
  return [...paths];
}

/**
 * When a trip is deleted, the feed posts that share it go too — but only the
 * trip owner's own. A post is its author's; deleting your trip mustn't delete
 * anyone else's post.
 */
export function linkedPostsToDelete(posts: { id: string; authorUid: string }[], tripOwnerUid: string): string[] {
  if (!tripOwnerUid) return [];
  return posts.filter((p) => p.authorUid === tripOwnerUid).map((p) => p.id);
}
