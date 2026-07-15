import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FREE_TIER_WEEKLY_AI_TRIP_LIMIT, getNextWeekStart, getWeeklyQuotaKey } from './quotaUtils';

export interface AiTripQuotaResponse {
  tier: 'free' | 'pro' | 'business';
  /** null = unlimited (pro/business) */
  limit: number | null;
  /** null = unlimited (pro/business) */
  remaining: number | null;
  /** ISO timestamp of the next reset (next Monday 00:00 UTC), null = unlimited */
  resetsAt: string | null;
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

    if (tier !== 'free') {
      return { tier, limit: null, remaining: null, resetsAt: null };
    }

    const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
    const quotaData = quotaDoc.data() ?? {};
    const used = quotaData[getWeeklyQuotaKey()] ?? 0;
    const remaining = Math.max(0, FREE_TIER_WEEKLY_AI_TRIP_LIMIT - used);

    return {
      tier,
      limit: FREE_TIER_WEEKLY_AI_TRIP_LIMIT,
      remaining,
      resetsAt: getNextWeekStart().toISOString(),
    };
  }
);
