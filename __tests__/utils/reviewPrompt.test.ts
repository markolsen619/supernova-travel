import { recordMoment, shouldAskForReview, type ReviewState } from '@/utils/reviewPrompt';

const DAY = 86_400_000;
const base: ReviewState = { installedAtMs: 0, moments: 0, tripsSaved: 0, lastAskedAtMs: null };

describe('rating prompt (owner, 2026-11-08)', () => {
  it('a trip counts only from the second one; other happy moments always count', () => {
    let s = recordMoment(base, 'trip');
    expect(s).toMatchObject({ tripsSaved: 1, moments: 0 });
    s = recordMoment(s, 'trip');
    expect(s).toMatchObject({ tripsSaved: 2, moments: 1 });
    expect(recordMoment(base, 'wishlist').moments).toBe(1);
  });
  it('asks only after 3 happy moments, 3 days in, and not again for 120 days', () => {
    const ready = { ...base, moments: 3 };
    expect(shouldAskForReview(ready, 2 * DAY)).toBe(false);
    expect(shouldAskForReview(ready, 4 * DAY)).toBe(true);
    expect(shouldAskForReview({ ...ready, moments: 2 }, 10 * DAY)).toBe(false);
    expect(shouldAskForReview({ ...ready, lastAskedAtMs: 4 * DAY }, 100 * DAY)).toBe(false);
    expect(shouldAskForReview({ ...ready, lastAskedAtMs: 4 * DAY }, 125 * DAY)).toBe(true);
  });
});
