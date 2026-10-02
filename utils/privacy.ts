/** Private accounts — the app's rules, pure and tested. Server side: functions/src/privacy.ts. */
export function isPrivateAccount(user: { settings?: { privacy?: string } } | null | undefined): boolean {
  return user?.settings?.privacy === 'private';
}

/** A private account is locked to everyone but its owner and its followers. */
export function profileAccess(a: { viewerUid: string; ownerUid: string; isPrivate: boolean; viewerFollows: boolean }): 'full' | 'locked' {
  if (!a.isPrivate || a.viewerFollows || (a.viewerUid && a.viewerUid === a.ownerUid)) return 'full';
  return 'locked';
}

export type FollowButtonState = 'self' | 'following' | 'requested' | 'request' | 'follow';

export function followButtonState(a: { isSelf: boolean; isFollowing: boolean; hasRequested: boolean; targetPrivate: boolean }): FollowButtonState {
  if (a.isSelf) return 'self';
  if (a.isFollowing) return 'following';
  if (a.targetPrivate) return a.hasRequested ? 'requested' : 'request';
  return 'follow';
}

/** While private, trips can't be made Public (the rules refuse it too). */
export function publicAllowed(isPrivate: boolean): boolean {
  return !isPrivate;
}

/**
 * A new post's visibility. While private it's followers-only, marked so going
 * public later restores it like the posts it had already (functions/src/privacy.ts).
 */
export function newPostVisibility(isPrivate: boolean): { visibility: 'public' } | { visibility: 'followers'; publicWhenAccountPublic: true } {
  return isPrivate ? { visibility: 'followers', publicWhenAccountPublic: true } : { visibility: 'public' };
}

/** Whether a post of this visibility is yours to see. Unset = from before posts had one = public. */
export function canSeePost(visibility: string | undefined, a: { isAuthor: boolean; follows: boolean }): boolean {
  if (visibility === undefined || visibility === 'public') return true;
  return visibility === 'followers' && (a.isAuthor || a.follows);
}
