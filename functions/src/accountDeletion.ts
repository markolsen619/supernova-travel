/**
 * Pure decisions behind deleteAccount (functions/src/deleteAccount.ts).
 *
 * Deliberately free of firebase-admin imports, like tierEvents.ts, so the
 * root jest suite can test it.
 */

/**
 * Storage prefixes owned by one user, matching storage.rules. `places/` is
 * absent on purpose: it's a shared photo cache keyed by placeId, not by user.
 */
export function userStoragePrefixes(uid: string): string[] {
  return [
    `posts/${uid}/`,
    `profile_photos/${uid}/`,
    `journal_photos/${uid}/`,
    `reservations/${uid}/`,
  ];
}

/** Top-level collections whose documents belong to one user via `ownerUid`. */
export const OWNER_UID_COLLECTIONS = ['boarding_passes', 'reservations', 'loyalty_programs'] as const;

/**
 * Fields on other users' notification docs that identify the person who
 * caused the notification, and so carry their name and avatar. Each needs a
 * collection-group field override in firestore.indexes.json.
 */
export const NOTIFICATION_ACTOR_FIELDS = ['likerUid', 'commenterUid', 'inviterUid'] as const;

export type ThreadRemoval =
  | { kind: 'delete-thread' }
  | { kind: 'leave-thread'; participants: string[]; clearPreview: boolean };

/**
 * What happens to a DM thread when one participant deletes their account.
 * Their own messages are always deleted separately; this decides the thread.
 *
 * A thread left with fewer than two people is a conversation with no one, so
 * it goes entirely. Otherwise the user is removed from it, and the inbox
 * preview is cleared if it's quoting them.
 */
export function threadRemoval(
  participants: readonly string[],
  lastMessageSenderUid: string | null | undefined,
  uid: string,
): ThreadRemoval {
  const remaining = participants.filter((p) => p !== uid);
  if (remaining.length < 2) return { kind: 'delete-thread' };
  return {
    kind: 'leave-thread',
    participants: remaining,
    clearPreview: lastMessageSenderUid === uid,
  };
}

/** Counter decrement that never goes below zero, matching useFollow.ts. */
export function decrementCount(current: unknown): number {
  const n = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  return Math.max(0, n - 1);
}

/**
 * Trip ids with a pending invite to this user, read from their own
 * notifications before those are deleted. Invite docs are keyed by the
 * invitee's uid, which a collection-group query can't filter on, so the
 * notifications are the index.
 */
export function invitedTripIds(
  notifications: ReadonlyArray<{ type?: unknown; tripId?: unknown }>,
): string[] {
  const ids = new Set<string>();
  for (const n of notifications) {
    if (n.type === 'trip_invite' && typeof n.tripId === 'string' && n.tripId) ids.add(n.tripId);
  }
  return [...ids];
}
