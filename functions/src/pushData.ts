/**
 * Builds the `data` field carried on an Expo push, from the in-app
 * notification document that is being written alongside it.
 *
 * Deriving it from the notification doc rather than asking each call site to
 * pass it separately means the two can't disagree: if a notification is
 * routable in-app, its push is routable too, by construction.
 *
 * No firebase-admin import here on purpose — that keeps this unit testable
 * from __tests__/functions, the same arrangement as accountDeletion.ts and
 * tierEvents.ts.
 *
 * The client half of this contract is utils/notificationRoute.ts, which maps
 * these same type strings and id keys to hrefs. They are separate TypeScript
 * projects and cannot share a module, so a new notification type has to be
 * added in both places.
 */

/**
 * The only fields copied onto a push. A notification doc also holds display
 * data (tripTitle, inviterName, avatar URLs); none of it is needed to route a
 * tap, and Expo caps a push payload at 4KiB, so the payload is a whitelist
 * rather than a spread of the doc.
 */
const ID_KEYS = ['postId', 'tripId', 'threadId', 'passId'] as const;

export function pushDataFor(
  notification: Record<string, unknown>,
): Record<string, string> | undefined {
  const { type } = notification;
  if (typeof type !== 'string' || type.length === 0) return undefined;

  const data: Record<string, string> = { type };
  for (const key of ID_KEYS) {
    const value = notification[key];
    if (typeof value === 'string' && value.length > 0) data[key] = value;
  }
  return data;
}
