/** Travelers to follow (spec 2026-10-24-seed-social-design.md §2): the onboarding faces' rules, ranked by activity. */
import { DEMO_REVIEW_UID, type FaceCandidate } from '@/utils/onboardingShowcase';

export const SUGGESTION_MAX = 6;
export const FOLLOW_TARGET = 3;
export type SuggestionCandidate = FaceCandidate & { followersCount: number; lastPostMs: number | null };

export function rankSuggestions<T extends SuggestionCandidate>(
  pool: T[], opts: { selfUid: string | null; following: ReadonlySet<string>; blocked: ReadonlySet<string>; max?: number },
): T[] {
  const seen = new Set<string>();
  const ok = pool.filter((p) => {
    if (seen.has(p.uid)) return false;
    seen.add(p.uid);
    return !!p.avatarUrl && !p.isPrivate && !p.isEditorial && !p.moderationHidden && p.uid !== opts.selfUid
      && p.uid !== DEMO_REVIEW_UID && !opts.blocked.has(p.uid) && !opts.following.has(p.uid);
  });
  ok.sort((a, b) => (b.lastPostMs ?? -1) - (a.lastPostMs ?? -1) || b.followersCount - a.followersCount);
  return ok.slice(0, opts.max ?? SUGGESTION_MAX);
}

export function shouldSuggest(followingCount: number, suggestions: number): boolean {
  return followingCount < FOLLOW_TARGET && suggestions > 0;
}

/** "3 TRIPS · 12 FOLLOWERS" under a suggested traveler's name; parts that are zero are left out. */
export function suggestionMeta(s: { tripsCount?: number; followersCount: number }): string {
  const part = (n: number, one: string, many: string) => (n > 0 ? `${n} ${n === 1 ? one : many}` : '');
  return [part(s.tripsCount ?? 0, 'TRIP', 'TRIPS'), part(s.followersCount, 'FOLLOWER', 'FOLLOWERS')].filter(Boolean).join(' · ');
}
