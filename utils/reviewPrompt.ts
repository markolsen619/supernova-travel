/**
 * When to ask for an App Store / Play rating (owner, 2026-11-08): after a happy moment — a trip saved (from the second
 * one), a wish-list save, finishing Year in Travel — once there have been 3, never in the first 3 days, at most once
 * every 120 days (Apple also caps the system prompt at 3 a year). Pure; services/reviewPrompt.ts keeps the state.
 */
export type HappyMoment = 'trip' | 'wishlist' | 'year';
export interface ReviewState { installedAtMs: number; moments: number; tripsSaved: number; lastAskedAtMs: number | null }

const DAY = 86_400_000;

export function recordMoment(s: ReviewState, kind: HappyMoment): ReviewState {
  if (kind === 'trip') {
    const tripsSaved = s.tripsSaved + 1;
    return { ...s, tripsSaved, moments: s.moments + (tripsSaved >= 2 ? 1 : 0) };
  }
  return { ...s, moments: s.moments + 1 };
}

export function shouldAskForReview(s: ReviewState, nowMs: number): boolean {
  if (s.moments < 3 || nowMs - s.installedAtMs < 3 * DAY) return false;
  return s.lastAskedAtMs == null || nowMs - s.lastAskedAtMs >= 120 * DAY;
}
