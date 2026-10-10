import { placeStatsFrom } from '../../functions/src/placeReviews';
import { autoHidePath } from '../../functions/src/moderation';

const r = (id: string, over: object = {}) => ({ id, rating: 4, photoUrls: [] as string[], updatedAtMs: 1, moderationHidden: false, ...over });

describe('placeStatsFrom', () => {
  it('sums ratings and collects the newest photos first, capped at 12', () => {
    const s = placeStatsFrom([
      r('a', { rating: 5, photoUrls: ['a1', 'a2'], updatedAtMs: 10 }),
      r('b', { rating: 3, photoUrls: ['b1'], updatedAtMs: 20 }),
      r('c', { rating: null, photoUrls: Array.from({ length: 12 }, (_, i) => `c${i}`), updatedAtMs: 5 }),
    ]);
    expect(s).toMatchObject({ reviewCount: 3, ratingCount: 2, ratingSum: 8, photoCount: 15 });
    expect(s.latestPhotos[0]).toEqual({ url: 'b1', reviewId: 'b' });
    expect(s.latestPhotos).toHaveLength(12);
  });
  it('leaves out hidden reviews', () => {
    expect(placeStatsFrom([r('a', { moderationHidden: true }), r('b')])).toMatchObject({ reviewCount: 1, ratingSum: 4 });
  });
});

describe('reported reviews', () => {
  it('auto-hide on the review itself', () => {
    expect(autoHidePath({ targetType: 'review', targetId: 'ChIJ_abc_u1' })).toBe('placeReviews/ChIJ_abc_u1');
  });
});
