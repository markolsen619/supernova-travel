/** A profile's Followers and Following lists, from `follows/{follower}_{followee}` docs. */
export type ConnectionKind = 'followers' | 'following';

/** Followers: follows where they're the followee, listing each follower. Following: the reverse. */
export function connectionQuery(kind: ConnectionKind): { matchField: 'followeeUid' | 'followerUid'; otherField: 'followerUid' | 'followeeUid' } {
  return kind === 'followers'
    ? { matchField: 'followeeUid', otherField: 'followerUid' }
    : { matchField: 'followerUid', otherField: 'followeeUid' };
}

/** The other person in each follow, once each, in the order given. */
export function connectionUids(follows: { followerUid?: string; followeeUid?: string }[], kind: ConnectionKind): string[] {
  const { otherField } = connectionQuery(kind);
  const seen = new Set<string>();
  for (const f of follows) {
    const uid = f?.[otherField];
    if (typeof uid === 'string' && uid) seen.add(uid);
  }
  return [...seen];
}
