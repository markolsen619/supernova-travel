import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { aiTripQuotaPolicy, type QuotaWindow } from './quotaUtils';

export interface AiTripQuotaResponse {
  tier: 'free' | 'pro' | 'business';
  /** Generations allowed in the window. Never null — every tier is metered. */
  limit: number;
  remaining: number;
  /** ISO timestamp of the next reset. */
  resetsAt: string;
  /** Both tiers are monthly. */
  window: QuotaWindow;
  /** True when `limit` is an anti-abuse ceiling, not a ration — see quotaUtils. */
  fairUse: boolean;
}

/**
 * Client-facing read of the SAME quota state generateTrip.ts enforces —
 * reuses quotaUtils so the "remaining" the UI shows can never drift from what
 * the server will actually allow. usage_quotas has no direct client access
 * (firestore.rules: `allow read, write: if false`), so this callable is the
 * only way the client can know the real remaining count.
 */
export const getAiTripQuota = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request): Promise<AiTripQuotaResponse> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.doc(`users/${uid}`).get();
    const tier = (userDoc.data()?.tier ?? 'free') as AiTripQuotaResponse['tier'];

    // No unlimited branch any more: paid is metered too, just on a weekly
    // window instead of a monthly one. Same policy object generateTrip
    // enforces with, so these two can't disagree.
    const policy = aiTripQuotaPolicy(tier);
    const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
    const used = (quotaDoc.data() ?? {})[policy.quotaKey] ?? 0;

    return {
      tier,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - used),
      resetsAt: policy.resetsAt.toISOString(),
      window: policy.window,
      fairUse: policy.fairUse,
    };
  }
);
