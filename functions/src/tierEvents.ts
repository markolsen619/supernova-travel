/**
 * Pure decision logic for the RevenueCat webhook. No firebase-admin, no
 * network — so it can be unit-tested directly (see
 * __tests__/functions/tierEvents.test.ts).
 */

export const PRO_ENTITLEMENT_ID = 'supernova_pro';

export type AppTier = 'free' | 'pro' | 'business';

/** The subset of the RevenueCat webhook event payload this function reads. */
export interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  /** null for lifetime / non-renewing purchases. */
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  cancel_reason?: string | null;
  store?: string;
  environment?: string;
  transferred_from?: string[];
  transferred_to?: string[];
}

/**
 * RevenueCat's anonymous ids look like "$RCAnonymousID:abc123". They are not
 * Firebase uids and have no user document, so events carrying one are skipped
 * rather than written. A real uid arrives once the client calls logIn().
 */
export function isAnonymousAppUserId(id: string | undefined | null): boolean {
  return !id || id.startsWith('$RCAnonymousID:');
}

/**
 * Whether this event concerns the Pro entitlement at all. Events for other
 * entitlements (or none, e.g. a non-subscription product) must not touch tier.
 *
 * TRANSFER events carry no entitlement_ids, but they always move whatever the
 * subscriber owned, so they're treated as relevant and resolved by re-reading
 * both sides.
 */
export function affectsProEntitlement(event: RevenueCatEvent): boolean {
  if (event.type === 'TRANSFER') return true;
  return (event.entitlement_ids ?? []).includes(PRO_ENTITLEMENT_ID);
}

/**
 * The tier this event implies for app_user_id.
 *
 * The nuance that matters: CANCELLATION does NOT revoke. On RevenueCat a
 * cancellation means auto-renew was switched off — the user keeps Pro until
 * the period ends, at which point a separate EXPIRATION event arrives.
 * Revoking on CANCELLATION would cut off users who have paid through to a
 * future date. Likewise BILLING_ISSUE starts a grace period, not a loss of
 * access; EXPIRATION follows if it's never resolved.
 *
 * A refund is the exception, and it identifies itself by moving
 * expiration_at_ms into the past — which is why expiry is checked directly
 * rather than trusting the event type alone.
 */
export function resolveTierForEvent(
  event: RevenueCatEvent,
  nowMs: number,
): AppTier | null {
  if (!affectsProEntitlement(event)) return null;

  if (event.type === 'EXPIRATION') return 'free';

  // Lifetime / non-renewing purchases have no expiry — they never lapse.
  if (event.expiration_at_ms === null || event.expiration_at_ms === undefined) {
    return 'pro';
  }

  // Refund, revocation, or an already-elapsed period.
  return event.expiration_at_ms > nowMs ? 'pro' : 'free';
}

/**
 * Out-of-order delivery guard. RevenueCat retries with at-least-once
 * semantics and gives no ordering guarantee, so a delayed RENEWAL can land
 * after the EXPIRATION that supersedes it. Events older than the last one
 * applied to a user are dropped.
 */
export function shouldApplyEvent(
  incomingTimestampMs: number | undefined,
  lastAppliedTimestampMs: number | undefined | null,
): boolean {
  if (incomingTimestampMs === undefined) return true; // Can't order it; take it.
  if (lastAppliedTimestampMs === undefined || lastAppliedTimestampMs === null) return true;
  return incomingTimestampMs >= lastAppliedTimestampMs;
}

// ---------------------------------------------------------------------------
// Reconciliation (functions/src/reconcileTier.ts)
// ---------------------------------------------------------------------------

/** One entitlement from RevenueCat's REST v1 GET /subscribers/{app_user_id}. */
export interface RevenueCatSubscriberEntitlement {
  /** null for lifetime / non-renewing purchases. */
  expires_date?: string | null;
  /** Set while a billing retry is in progress; access continues until it passes. */
  grace_period_expires_date?: string | null;
}

/** The subset of the REST v1 subscriber object reconciliation reads. */
export interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatSubscriberEntitlement> | null;
}

/**
 * The tier RevenueCat's current record implies, as opposed to the tier a
 * single webhook event implies. The REST response lists entitlements the
 * subscriber has ever held, expired ones included, so presence alone is not
 * a grant: expiry has to be checked.
 *
 * The grace period counts as access for the same reason BILLING_ISSUE does
 * not revoke in resolveTierForEvent(): a failed renewal is still being
 * retried, and the user keeps Pro until the retry window closes.
 */
export function tierFromSubscriber(
  subscriber: RevenueCatSubscriber | null | undefined,
  nowMs: number,
): AppTier {
  const ent = subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
  if (!ent) return 'free';
  if (ent.expires_date === null || ent.expires_date === undefined) return 'pro';

  const expires = Date.parse(ent.expires_date);
  const grace = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : NaN;
  if (expires > nowMs) return 'pro';
  if (grace > nowMs) return 'pro';
  return 'free';
}

/**
 * Minimum gap between REST lookups for one user. The client asks for a
 * reconcile whenever the SDK and Firestore disagree, and a burst of
 * CustomerInfo updates can do that several times in a second; this keeps a
 * misbehaving client from spending RevenueCat's API rate limit.
 */
export const RECONCILE_COOLDOWN_MS = 30 * 1000;

export function isReconcileThrottled(
  lastReconciledMs: number | undefined | null,
  nowMs: number,
): boolean {
  if (lastReconciledMs === undefined || lastReconciledMs === null) return false;
  return nowMs - lastReconciledMs < RECONCILE_COOLDOWN_MS;
}
