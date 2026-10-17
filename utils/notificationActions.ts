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

/** How an invite or follow request row ended, as read back from the server. */
export type RowAnswer = 'accepted' | 'declined' | 'gone';
/** Server answers by notification id; null = still waiting for you. A missing key = not loaded yet. */
export type ServerAnswers = Record<string, RowAnswer | null>;

/**
 * A trip invite row's answer from `trips/{tripId}/invites/{you}`. The session-only `handled` map
 * forgot an answered invite as soon as the screen remounted, so Accept came back on a trip you
 * were already on (2026-10-16).
 */
export function inviteAnswer(status: 'pending' | 'accepted' | 'declined' | 'missing'): RowAnswer | null {
  if (status === 'pending') return null;
  return status === 'missing' ? 'gone' : status;
}

/** A follow request row's answer: the request doc is deleted once answered either way. */
export function followRequestAnswer(s: { requestExists: boolean; theyFollow: boolean }): RowAnswer | null {
  if (s.requestExists) return null;
  return s.theyFollow ? 'accepted' : 'declined';
}

/** What a row shows: your tap this session first, then the server's answer. */
export function rowAnswer(id: string, handled: HandledInvites, server: ServerAnswers): RowAnswer | null {
  return handled[id] ?? server[id] ?? null;
}

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
  server: ServerAnswers = {},
): boolean {
  // A follow request too: answering it is only possible from this row.
  if (notification.type !== 'trip_invite' && notification.type !== 'follow_request') return true;
  return rowAnswer(notification.id, handled, server) !== null;
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
