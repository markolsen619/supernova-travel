import type { AiTripQuota } from '@/types/ai';

/**
 * What getAiTripQuota returned before every tier was metered: paid tiers came
 * back as nulls meaning "unlimited", and the only window was weekly.
 */
interface LegacyAiTripQuota {
  tier: AiTripQuota['tier'];
  limit: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

/**
 * Accepts either response shape from getAiTripQuota and returns the current one.
 *
 * The client and the Cloud Function ship on different clocks: a build can
 * reach TestFlight or the App Store while the deployed function is still the
 * older one (and the reverse). Without this, a Pro user against the old
 * function read `remaining: null` as "none left". Remove once no deployed
 * function can return the legacy shape.
 */
export function normalizeAiTripQuota(raw: AiTripQuota | LegacyAiTripQuota): AiTripQuota {
  if ('window' in raw && 'fairUse' in raw) return raw;

  if (raw.limit === null || raw.remaining === null) {
    // Unlimited. Any positive remaining renders as "Unlimited AI trips".
    return { tier: raw.tier, limit: 1, remaining: 1, resetsAt: raw.resetsAt ?? '', window: 'week', fairUse: true };
  }

  return {
    tier: raw.tier,
    limit: raw.limit,
    remaining: raw.remaining,
    resetsAt: raw.resetsAt ?? '',
    window: 'week',
    fairUse: false,
  };
}
