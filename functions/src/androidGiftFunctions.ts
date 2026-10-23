import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { PRO_ENTITLEMENT_ID, RevenueCatSubscriber, tierFromSubscriber } from './tierEvents';
import { androidGiftDecision, androidGiftEndMs, ANDROID_GIFT_CAP, AndroidGiftDecision } from './androidGift';

/**
 * claimAndroidGift — the Android app calls this once per account (hooks/useAndroidGift).
 * Pure rules in androidGift.ts. State, all server-only (no rule = denied):
 * serverState/androidGift { granted } (the cap) and androidGifts/{uid} (one per account).
 * A place is reserved in a transaction before RevenueCat is called and given back if
 * the grant fails, so the cap can't be overrun by parallel calls or eaten by errors.
 *
 * The platform can't be proven server-side; a faked call from an iPhone costs at most
 * one of the ten places, which the owner accepted.
 */

const SECRET_API_KEY = process.env.REVENUECAT_SECRET_API_KEY ?? '';

export interface ClaimAndroidGiftResponse {
  status: AndroidGiftDecision;
  /** Set when status is 'grant': when the free year ends. */
  endsAtMs?: number;
}

function rc(uid: string, path = '', init: RequestInit = {}) {
  return fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${SECRET_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`RevenueCat ${path || 'lookup'} failed with HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { subscriber?: RevenueCatSubscriber };
    return body.subscriber ?? {};
  });
}

export const claimAndroidGift = functions.https.onCall(
  // Public at the Cloud Run level like every callable (the SDK checks the Firebase sign-in);
  // the first deploy left it private, so it's stated here.
  { region: 'us-central1', enforceAppCheck: false, invoker: 'public' },
  async (request): Promise<ClaimAndroidGiftResponse> => {
    if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    if (!SECRET_API_KEY) throw new functions.https.HttpsError('failed-precondition', 'Not configured');
    const uid = request.auth.uid;
    const db = admin.firestore();
    const counterRef = db.doc('serverState/androidGift');
    const claimRef = db.doc(`androidGifts/${uid}`);
    const userRef = db.doc(`users/${uid}`);

    const authUser = await admin.auth().getUser(uid);
    const accountCreatedMs = Date.parse(authUser.metadata.creationTime);

    let subscriber: RevenueCatSubscriber;
    try {
      subscriber = await rc(uid);
    } catch (error) {
      functions.logger.error('[claimAndroidGift] lookup failed', { uid, error });
      throw new functions.https.HttpsError('unavailable', 'Could not reach the subscription service');
    }
    const hasPro = tierFromSubscriber(subscriber, Date.now()) !== 'free';

    const decision = await db.runTransaction(async (tx) => {
      const [counter, claim] = await Promise.all([tx.get(counterRef), tx.get(claimRef)]);
      const grantedCount = Number(counter.data()?.granted ?? 0);
      const d = androidGiftDecision({ accountCreatedMs, alreadyClaimed: claim.exists, hasPro, grantedCount });
      if (d === 'grant') {
        tx.set(counterRef, { granted: grantedCount + 1, cap: ANDROID_GIFT_CAP }, { merge: true });
        tx.set(claimRef, { uid, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      return d;
    });
    if (decision !== 'grant') return { status: decision };

    const endsAtMs = androidGiftEndMs(Date.now());
    try {
      await rc(uid, `/entitlements/${PRO_ENTITLEMENT_ID}/promotional`, {
        method: 'POST',
        body: JSON.stringify({ end_time_ms: endsAtMs }),
      });
    } catch (error) {
      // Give the place back so a retry (or someone else) can have it.
      await db.runTransaction(async (tx) => {
        const counter = await tx.get(counterRef);
        tx.set(counterRef, { granted: Math.max(0, Number(counter.data()?.granted ?? 1) - 1) }, { merge: true });
        tx.delete(claimRef);
      });
      functions.logger.error('[claimAndroidGift] grant failed', { uid, error });
      throw new functions.https.HttpsError('unavailable', 'Could not grant the gift');
    }

    // Mirror the tier the way reconcileTier / gift-pro do, so server limits see Pro at once.
    const readAtMs = Date.now();
    const tier = tierFromSubscriber(await rc(uid).catch(() => ({})), readAtMs);
    await Promise.all([
      claimRef.update({ status: 'granted', endsAtMs }),
      userRef.update({
        tier: tier === 'free' ? 'pro' : tier,
        tierEventTimestampMs: readAtMs,
        tierEventId: `androidGift:${readAtMs}`,
        tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    functions.logger.info('[claimAndroidGift] granted', { uid, endsAtMs });
    return { status: 'grant', endsAtMs };
  },
);
