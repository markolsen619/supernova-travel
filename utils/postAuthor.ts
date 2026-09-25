import type { Post } from '@/types';
import type { AuthorInfo } from '@/hooks/useAuthorProfiles';

/**
 * Which name and avatar a post should show.
 *
 * A post stores `authorDisplayName` and `authorAvatarUrl` denormalized at
 * creation time, which is right for the feed — one query returns everything
 * a card needs. But a denormalized copy is a snapshot, and profiles change:
 * post first, set a profile photo eleven minutes later, and the post keeps
 * showing initials forever while the profile screen shows the photo. Change
 * your photo and every old post keeps the old one.
 *
 * So the live profile wins when it is loaded, and the stored copy is the
 * fallback. The stored fields stay useful rather than becoming dead weight:
 * they carry the first render before the batched profile query resolves, and
 * they are all that is left when an author deletes their account.
 */
export function resolvePostAuthor(
  post: Pick<Post, 'authorDisplayName' | 'authorAvatarUrl'>,
  live: AuthorInfo | undefined,
): AuthorInfo {
  return {
    // Avatar renders initials from this. An empty string renders a blank
    // circle, which reads as broken rather than as anonymous.
    name: live?.name || post.authorDisplayName || 'Traveler',
    // A live profile with no avatar does NOT erase a stored one. Null here
    // means "removed their photo" and "this partial doc has no avatar field"
    // equally, and blanking a working avatar is the worse of the two
    // mistakes to make.
    avatarUrl: live?.avatarUrl ?? post.authorAvatarUrl ?? null,
  };
}
