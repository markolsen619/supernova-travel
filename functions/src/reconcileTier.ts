import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  AppTier,
  RevenueCatSubscriber,
  isReconcileThrottled,
  shouldApplyEvent,
  tierFromSubscriber,
} from './tierEvents';

/**
 * Re-derives users/{uid}.tier from RevenueCat's REST API.
 *
 * syncTier (the webhook) is the normal writer of tier, and it is only as
 * reliable as delivery. An outage that outlasts RevenueCat's retry schedule,
 * or a stretch when the webhook URL or secret was wrong, leaves the tier
 * permanently stale: the SDK reports Pro, generateTrip still enforces the
 * free quota, and firestore.rules forbid the client from repairing it. This
 * callable is that repair path. The client calls it whenever the SDK's tier
 * disagrees with the tier Firestore last reported (hooks/useRevenueCatSync.ts),
 * which also closes the few seconds of webhook latency after a purchase.
 *
 * It trusts nothing from the client: the uid comes from request.auth and the
 * tier comes from RevenueCat, so calling it can only ever write the truth.
 *
 * Setup: REVENUECAT_SECRET_API_KEY in functions/.env — a v1 *secret* key
 * (sk_…) from RevenueCat → Project settings → API keys. Never the public
 * appl_/goog_ key, and never in the client bundle.
 */

const SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY ?? '';

export interface ReconcileTierResponse {
  /** The tier Firestore holds once this call returns. */
  tier: AppTier;
  /** false when the call was throttled and RevenueCat was not consulted. */
  reconciled: boolean;
  /** Whether this call changed the stored tier. */
  changed: boolean;
}

async function fetchSubscriber(uid: string): Promise<RevenueCatSubscriber> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${SECRET_API_KEY}`, Accept: 'application/json' } },
  );
  if (!res.ok) {
    throw new Error(`RevenueCat subscriber lookup failed with HTTP ${res.status}`);
  }
  const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
  return body.subscriber ?? {};
}

export const reconcileTier = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request): Promise<ReconcileTierResponse> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    if (!SECRET_API_KEY) {
      functions.logger.error('[reconcileTier] REVENUECAT_SECRET_API_KEY is not set');
      throw new functions.https.HttpsError('failed-precondition', 'Tier reconciliation is not configured');
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    const userRef = db.doc(`users/${uid}`);

    // Claim the cooldown slot before calling out, in a transaction, so two
    // concurrent calls can't both slip past the throttle.
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { kind: 'no-user' as const };
      const data = snap.data() ?? {};
      const nowMs = Date.now();
      if (isReconcileThrottled(data.tierReconciledAtMs, nowMs)) {
        return { kind: 'throttled' as const, tier: (data.tier ?? 'free') as AppTier };
      }
      tx.update(userRef, { tierReconciledAtMs: nowMs });
      return { kind: 'claimed' as const };
    });

    if (claim.kind === 'no-user') {
      throw new functions.https.HttpsError('not-found', 'No profile for this account');
    }
    if (claim.kind === 'throttled') {
      return { tier: claim.tier, reconciled: false, changed: false };
    }

    // Captured before the lookup: the answer reflects RevenueCat as of about
    // now, so a webhook stamped later than this carries newer information.
    const readAtMs = Date.now();
    let subscriber: RevenueCatSubscriber;
    try {
      subscriber = await fetchSubscriber(uid);
    } catch (error) {
      functions.logger.error('[reconcileTier] subscriber lookup failed', { uid, error });
      throw new functions.https.HttpsError('unavailable', 'Could not reach the subscription service');
    }
    const tier = tierFromSubscriber(subscriber, readAtMs);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data() ?? {};
      const current = (data.tier ?? 'free') as AppTier;

      // A webhook landed while the lookup was in flight; it is newer than our
      // read, so it wins.
      if (!shouldApplyEvent(readAtMs, data.tierEventTimestampMs)) {
        return { tier: current, changed: false };
      }
      if (current === tier) {
        return { tier, changed: false };
      }

      tx.update(userRef, {
        tier,
        // Moving the webhook's ordering cursor forward means any event older
        // than this read that is still being redelivered is dropped as stale
        // by syncTier, instead of overwriting the corrected tier.
        tierEventTimestampMs: readAtMs,
        tierEventId: `reconcile:${readAtMs}`,
        tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { tier, changed: true };
    });

    if (outcome.changed) {
      // Every change here is a webhook that didn't land. Worth alerting on.
      functions.logger.warn('[reconcileTier] corrected a stale tier', { uid, tier: outcome.tier });
    }

    return { tier: outcome.tier, reconciled: true, changed: outcome.changed };
  },
);
