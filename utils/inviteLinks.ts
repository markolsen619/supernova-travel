/**
 * Trip invite links on the phone (spec 2026-10-30-trip-invite-links-design.md): which strings are our invite
 * links, the Play install referrer, when to offer Paste, and whether a claimed invite joins at once. Pure.
 */
const WEB = /https:\/\/supernova-a2125\.web\.app\/join\/([a-z0-9]{16})(?=$|[/?#\s])/;
const APP = /supernova:\/\/join\/([a-z0-9]{16})(?=$|[/?#\s])/;
const TOKEN = /^[a-z0-9]{16}$/;
const DAY = 86_400_000;

export function parseInviteToken(text: string | null | undefined): string | null {
  if (!text) return null;
  return WEB.exec(text)?.[1] ?? APP.exec(text)?.[1] ?? null;
}

export function parseInstallReferrer(ref: string | null | undefined): string | null {
  if (!ref) return null;
  let decoded = ref;
  try { decoded = decodeURIComponent(ref); } catch { /* keep raw */ }
  for (const pair of decoded.split('&')) {
    const [k, v] = pair.split('=');
    if (k === 'invite' && v && TOKEN.test(v)) return v;
  }
  return null;
}

/**
 * iPhone only: the App Store can't carry an invite through an install, so the invite page copies the link when
 * someone taps Download (functions/src/tripInviteLinks.ts). A new account (< 24 h) with no invite waiting looks at
 * the clipboard once; reading it shows iOS's own Allow Paste question (owner, 2026-10-31).
 */
export const shouldCheckClipboard = (i: {
  platform: string; createdAtMs: number | null; nowMs: number; alreadyChecked: boolean; hasPending: boolean;
}) => i.platform === 'ios' && !i.alreadyChecked && !i.hasPending && claimMode(i) === 'auto';

export const claimMode = (i: { createdAtMs: number | null; nowMs: number }): 'auto' | 'confirm' =>
  i.createdAtMs !== null && i.nowMs - i.createdAtMs < DAY ? 'auto' : 'confirm';

export function inviteErrorCopy(code: string | undefined, inviterFirst?: string | null): string {
  const c = (code ?? '').replace(/^functions\//, '');
  if (c === 'failed-precondition') return `This invite has expired. Ask ${inviterFirst || 'your friend'} for a new one.`;
  if (c === 'permission-denied') return "You can't join this trip.";
  if (c === 'invalid-argument') return "This invite link isn't valid.";
  if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'internal') return "Couldn't reach Supernova. Check your connection and try again.";
  return 'Something went wrong joining this trip. Try again.';
}

/**
 * Whether a waiting invite is finished with (review, 2026-10-30): after a join or a final refusal, yes; when the
 * phone couldn't reach us, keep it for the next start.
 */
export function shouldClearPending(outcome: string): boolean {
  const c = outcome.replace(/^functions\//, '');
  return c === 'joined' || c === 'member' || c === 'failed-precondition' || c === 'permission-denied' || c === 'invalid-argument';
}
