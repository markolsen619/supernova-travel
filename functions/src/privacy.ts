/** Private accounts — pure server rules, unit-tested; I/O in privacyFunctions.ts. */
export function followRequestId(requesterUid: string, targetUid: string): string {
  return `${requesterUid}_${targetUid}`;
}

type Vis = { id: string; visibility?: string; publicWhenAccountPublic?: boolean };

/**
 * Trips and posts to change when an account changes privacy. Going private,
 * public ones (and posts from before posts had a visibility) become
 * followers-only, remembering it. Going public, only those come back — a
 * trip the owner chose to keep followers-only stays that way.
 */
export function privacyTransition(toPrivate: boolean, docs: Vis[]): { id: string; visibility: 'public' | 'followers'; publicWhenAccountPublic: boolean }[] {
  if (toPrivate) {
    return docs
      .filter((d) => d.visibility === 'public' || d.visibility === undefined)
      .map((d) => ({ id: d.id, visibility: 'followers' as const, publicWhenAccountPublic: true }));
  }
  return docs
    .filter((d) => d.publicWhenAccountPublic === true && d.visibility === 'followers')
    .map((d) => ({ id: d.id, visibility: 'public' as const, publicWhenAccountPublic: false }));
}

/** What a newly created post's visibility should become; null leaves it. */
export function postVisibilityOnCreate(post: { visibility?: unknown }, authorPrivate: boolean): 'public' | 'followers' | null {
  if (post.visibility === undefined || post.visibility === null) return authorPrivate ? 'followers' : 'public';
  if (post.visibility === 'public' && authorPrivate) return 'followers';
  return null;
}
