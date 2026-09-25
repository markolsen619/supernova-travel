import type { AppNotification } from '@/types';

/**
 * What a user may do to their own notification inbox.
 *
 * Notifications are authored exclusively by Cloud Functions (see
 * firestore.rules — the owner may only ever flip `read`). Deletion is the one
 * exception worth granting: it is the user's own inbox, and a list that only
 * ever grows is a list people stop opening.
 */

/** Invite rows the user has actioned this session, keyed by notification id. */
export type HandledInvites = Record<string, 'accepted' | 'declined'>;

/**
 * Whether this row may be removed.
 *
 * Everything is deletable except a trip invite still awaiting an answer. The
 * invite itself lives server-side against the trip, so deleting the row does
 * not destroy it — but this screen is the only place it can be accepted from,
 * so removing it strands the user with an invitation and no way to reach it.
 * Once answered, the row is just history and can go.
 */
export function canDeleteNotification(
  notification: AppNotification,
  handled: HandledInvites,
): boolean {
  if (notification.type !== 'trip_invite') return true;
  return handled[notification.id] !== undefined;
}

/**
 * The list without `id`, for the optimistic cache update.
 *
 * Returns a new array — TanStack Query compares by reference, and mutating
 * the cached array in place would leave the UI showing the deleted row until
 * something else forced a render. Tolerates undefined, which is what the
 * cache holds before the first fetch resolves.
 */
export function removeNotification<T extends { id: string }>(
  list: T[] | undefined,
  id: string,
): T[] {
  if (!list) return [];
  return list.filter((n) => n.id !== id);
}
