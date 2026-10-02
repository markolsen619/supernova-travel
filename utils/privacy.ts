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
