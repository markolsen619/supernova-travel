/**
 * Android welcome gift (owner's call, 2026-10-23): the first 10 accounts made
 * since the Play launch that open the Android app get a year of Pro, as a
 * RevenueCat promotional entitlement (no card, nothing renews) — the same
 * mechanism as scripts/gift-pro.mjs. Pure rules; wiring in androidGiftFunctions.ts.
 *
 * Play can't do this with a promo code: its free trials stop at 90 days and
 * then renew.
 */

export const ANDROID_GIFT_CAP = 10;
export const ANDROID_GIFT_DAYS = 365;
/** 2026-10-22, the day 1.0.7 went live on Google Play (US Pacific midnight). */
export const ANDROID_LAUNCH_MS = Date.UTC(2026, 9, 22, 7, 0, 0);

export type AndroidGiftDecision = 'grant' | 'already' | 'has_pro' | 'not_new' | 'full';

export function androidGiftDecision(a: {
  /** From Firebase Auth's metadata, not the profile doc the client writes. */
  accountCreatedMs: number;
  alreadyClaimed: boolean;
  hasPro: boolean;
  grantedCount: number;
}): AndroidGiftDecision {
  if (a.alreadyClaimed) return 'already';
  if (!(a.accountCreatedMs >= ANDROID_LAUNCH_MS)) return 'not_new';
  if (a.hasPro) return 'has_pro';
  if (a.grantedCount >= ANDROID_GIFT_CAP) return 'full';
  return 'grant';
}

export function androidGiftEndMs(nowMs: number): number {
  return nowMs + ANDROID_GIFT_DAYS * 24 * 60 * 60 * 1000;
}
