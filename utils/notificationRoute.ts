/**
 * Where a notification goes when you tap it.
 *
 * Deliberately shared by two callers that used to disagree by construction:
 * the push response listener (hooks/useNotificationRouting) and the in-app
 * notifications list (app/notifications.tsx). Keeping one table means a new
 * notification type can't be routed in-app but dropped on a push tap.
 *
 * The Cloud Functions side can't import this file (functions/ is a separate
 * TypeScript project), so the contract it upholds is the `type` strings and
 * the id key each one carries — see notify.ts's pushDataFor().
 *
 * Route strings are group-qualified ('/(wallet)/...') to match how the rest
 * of the app calls router.push.
 */

type RouteSpec = {
  /** The field on the payload holding the id this route needs. */
  idKey: string;
  build: (id: string) => string;
};

const ROUTES: Record<string, RouteSpec> = {
  post_like: { idKey: 'postId', build: (id) => `/post/${id}` },
  post_comment: { idKey: 'postId', build: (id) => `/post/${id}` },
  trip_invite: { idKey: 'tripId', build: (id) => `/trip/${id}` },
  trip_invite_accepted: { idKey: 'tripId', build: (id) => `/trip/${id}` },
  direct: { idKey: 'threadId', build: (id) => `/messages/${id}` },
  flight_status: { idKey: 'passId', build: (id) => `/(wallet)/boarding-pass/${id}` },
};

/**
 * @param data the push payload's `data` field, or an in-app notification doc.
 * @returns an href, or null when this build can't route the payload — an
 * unknown type, a missing id, or no payload at all. Null means "open the app
 * normally", never "crash": a user on an old build must survive a notification
 * type shipped after their version.
 */
export function resolveNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  if (typeof record.type !== 'string') return null;

  const spec = ROUTES[record.type];
  if (!spec) return null;

  const id = record[spec.idKey];
  if (typeof id !== 'string' || id.length === 0) return null;

  return spec.build(id);
}
