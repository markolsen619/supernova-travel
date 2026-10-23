/**
 * The Android welcome gift (functions/src/androidGift.ts): the first 10 new
 * accounts on Android get a year of Pro. The app asks once per account;
 * the server decides.
 */

const SETTLED = new Set(['grant', 'already', 'not_new', 'full', 'has_pro']);

export function shouldClaimAndroidGift(a: { platform: string; tier: string; checked: boolean }): boolean {
  return a.platform === 'android' && a.tier === 'free' && !a.checked;
}

/** A server answer worth remembering, so the device doesn't ask again. Errors are retried next launch. */
export function isSettledGiftAnswer(status: unknown): boolean {
  return typeof status === 'string' && SETTLED.has(status);
}

export function giftEndLabel(endsAtMs: number): string {
  return new Date(endsAtMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
