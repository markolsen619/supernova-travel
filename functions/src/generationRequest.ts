/**
 * Makes trip generation safe to retry. The app sends a `requestId` (a
 * Firestore auto-id it made) with each generation, and the trip is written
 * at `trips/{requestId}`. A phone can lose the connection while the server
 * finishes — the app saw "internal" and the user retried into a duplicate —
 * so a retry with the same id gets the trip already made instead of a second
 * one, and the app can look the trip up itself. Pure: no firebase-admin.
 */

const AUTO_ID = /^[A-Za-z0-9]{20}$/;

export function isValidRequestId(id: unknown): id is string {
  return typeof id === 'string' && AUTO_ID.test(id);
}

/** What to do given what's already at `trips/{requestId}`. */
export function existingTripDecision(
  existing: { authorUid?: unknown } | undefined,
  uid: string,
): 'create' | 'return' | 'conflict' {
  if (!existing) return 'create';
  return existing.authorUid === uid ? 'return' : 'conflict';
}
