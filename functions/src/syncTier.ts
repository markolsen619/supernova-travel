import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import {
  RevenueCatEvent,
  AppTier,
  isAnonymousAppUserId,
  resolveTierForEvent,
  shouldApplyEvent,
} from './tierEvents';

/**
 * RevenueCat webhook -> users/{uid}.tier
 *
 * This is the ONLY writer of the `tier` field. firestore.rules explicitly
 * forbids clients from writing it (a client that can set its own tier can
 * grant itself unlimited AI trip generation), and generateTrip.ts reads it to
 * decide whether to enforce the free-tier weekly quota. Without this function
 * every paying customer stays quota-limited server-side.
 *
 * Setup (RevenueCat dashboard -> Integrations -> Webhooks):
 *   URL:            take it from the `firebase deploy` output or
 *                   `firebase functions:list`. A v2 function answers on two
 *                   hostnames — the Cloud Run service
 *                   (https://synctier-<hash>-uc.a.run.app) and the Firebase
 *                   alias (https://us-central1-<project>.cloudfunctions.net/
 *                   syncTier). Both work. Prefer the alias: no generated hash
 *                   to mistype, and it survives the underlying service being
 *                   recreated.
 *   Authorization:  the REVENUECAT_WEBHOOK_SECRET value, raw, with no
 *                   "Bearer " prefix — isAuthorized() compares it verbatim.
 */

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET ?? '';

/**
 * Constant-time compare so the shared secret can't be recovered by timing the
 * response. Length is compared first because timingSafeEqual throws on a
 * length mismatch.
 */
function isAuthorized(header: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Applies a tier to one user, inside a transaction that enforces both
 * idempotency and event ordering. Returns what it did, for the log line.
 */
async function applyTier(
  uid: string,
  tier: AppTier,
  eventTimestampMs: number | undefined,
  eventId: string,
): Promise<'applied' | 'stale' | 'no-user' | 'unchanged'> {
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      // A webhook can beat the client's profile write on a brand-new account.
      // Writing a partial doc here would create a user document with no
      // profile, which every reader would treat as a corrupt account — so the
      // caller answers 500 instead and lets RevenueCat redeliver once the
      // profile exists. Answering 200 here would drop the grant permanently:
      // there is no reconciliation path, because firestore.rules forbids the
      // client from writing its own tier.
      return 'no-user' as const;
    }

    const data = snap.data() ?? {};
    if (!shouldApplyEvent(eventTimestampMs, data.tierEventTimestampMs)) {
      return 'stale' as const;
    }
    if (data.tier === tier && data.tierEventId === eventId) {
      return 'unchanged' as const;
    }

    tx.update(userRef, {
      tier,
      // Ordering + idempotency cursor for the next event.
      tierEventTimestampMs: eventTimestampMs ?? Date.now(),
      tierEventId: eventId,
      tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return 'applied' as const;
  });
}

export const syncTier = functions.https.onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    if (!isAuthorized(req.headers.authorization)) {
      // Deliberately terse — don't tell an unauthenticated caller whether the
      // secret is unset or merely wrong.
      functions.logger.warn('[syncTier] rejected unauthorized webhook call');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = (req.body?.event ?? null) as RevenueCatEvent | null;
    if (!event || typeof event.type !== 'string') {
      res.status(400).send('Malformed event');
      return;
    }

    const eventId = String((req.body.event as { id?: string }).id ?? '');

    try {
      // TRANSFER moves entitlements between accounts (e.g. a user signs in on
      // a device that already had a purchase). Both sides must be updated, and
      // the payload names them explicitly rather than via app_user_id.
      if (event.type === 'TRANSFER') {
        const losers = event.transferred_from ?? [];
        const winners = event.transferred_to ?? [];
        await Promise.all([
          ...losers
            .filter((id) => !isAnonymousAppUserId(id))
            .map((id) => applyTier(id, 'free', event.event_timestamp_ms, eventId)),
          ...winners
            .filter((id) => !isAnonymousAppUserId(id))
            .map((id) => applyTier(id, 'pro', event.event_timestamp_ms, eventId)),
        ]);
        functions.logger.info('[syncTier] transfer applied', {
          from: losers.length,
          to: winners.length,
        });
        res.status(200).send('OK');
        return;
      }

      const uid = event.app_user_id;
      if (isAnonymousAppUserId(uid)) {
        // Purchase made before sign-in. A TRANSFER event follows once the
        // client calls logIn(), which is what actually grants the tier.
        functions.logger.info('[syncTier] skipped anonymous app_user_id', { type: event.type });
        res.status(200).send('OK');
        return;
      }

      const tier = resolveTierForEvent(event, Date.now());
      if (tier === null) {
        // Some other entitlement, or none — not ours to act on.
        res.status(200).send('OK');
        return;
      }

      const result = await applyTier(uid as string, tier, event.event_timestamp_ms, eventId);

      if (result === 'no-user') {
        // Retryable: the user document should appear within seconds. 500 buys
        // RevenueCat's backoff schedule; 200 would lose the purchase.
        functions.logger.warn('[syncTier] no user document yet, asking for redelivery', {
          type: event.type,
          uid,
        });
        res.status(500).send('User not ready');
        return;
      }

      functions.logger.info('[syncTier] processed', {
        type: event.type,
        uid,
        tier,
        result,
        environment: event.environment,
      });

      res.status(200).send('OK');
    } catch (error) {
      // 500 makes RevenueCat retry with backoff — the right outcome for a
      // transient Firestore failure. Never swallow this into a 200.
      functions.logger.error('[syncTier] failed to process event', {
        type: event.type,
        error,
      });
      res.status(500).send('Error');
    }
  },
);
