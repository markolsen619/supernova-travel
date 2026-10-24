// __tests__/utils/travelerSuggestions.test.ts
import { rankSuggestions, shouldSuggest, suggestionMeta, SUGGESTION_MAX } from '@/utils/travelerSuggestions';
import { DEMO_REVIEW_UID } from '@/utils/onboardingShowcase';

const c = (uid: string, over: Record<string, unknown> = {}) => ({ uid, name: uid, avatarUrl: 'https://x/a.jpg', followersCount: 0, lastPostMs: null as number | null, ...over });
const opts = { selfUid: 'me', following: new Set<string>(), blocked: new Set<string>() };

describe('rankSuggestions', () => {
  it('people who posted most recently first, then the most followed', () => {
    const r = rankSuggestions([c('quiet', { followersCount: 50 }), c('old', { lastPostMs: 1 }), c('new', { lastPostMs: 9 }), c('popular', { followersCount: 90 })], opts);
    expect(r.map((x) => x.uid)).toEqual(['new', 'old', 'popular', 'quiet']);
  });
  it('never yourself, private, editorial, hidden, the review account, blocked, already followed, or without a photo', () => {
    const pool = [c('me'), c('p', { isPrivate: true }), c('e', { isEditorial: true }), c('h', { moderationHidden: true }), c(DEMO_REVIEW_UID),
      c('b'), c('f'), c('nophoto', { avatarUrl: null }), c('ok')];
    expect(rankSuggestions(pool, { ...opts, blocked: new Set(['b']), following: new Set(['f']) }).map((x) => x.uid)).toEqual(['ok']);
  });
  it('each person once, at most six', () => {
    const pool = [...Array.from({ length: 10 }, (_, i) => c(`u${i}`, { followersCount: i })), c('u9')];
    const r = rankSuggestions(pool, opts);
    expect(r).toHaveLength(SUGGESTION_MAX);
    expect(new Set(r.map((x) => x.uid)).size).toBe(SUGGESTION_MAX);
  });
});

describe('shouldSuggest', () => {
  it('while following fewer than three, and only with someone to suggest', () => {
    expect(shouldSuggest(0, 4)).toBe(true);
    expect(shouldSuggest(2, 1)).toBe(true);
    expect(shouldSuggest(3, 4)).toBe(false);
    expect(shouldSuggest(0, 0)).toBe(false);
  });
});

describe('suggestionMeta (final review)', () => {
  it('trips and followers, singular where it should be, zeros left out', () => {
    expect(suggestionMeta({ tripsCount: 3, followersCount: 12 })).toBe('3 TRIPS · 12 FOLLOWERS');
    expect(suggestionMeta({ tripsCount: 1, followersCount: 1 })).toBe('1 TRIP · 1 FOLLOWER');
    expect(suggestionMeta({ tripsCount: 0, followersCount: 4 })).toBe('4 FOLLOWERS');
    expect(suggestionMeta({ followersCount: 0 })).toBe('');
  });
});
