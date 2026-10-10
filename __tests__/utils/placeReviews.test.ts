import { reviewId, reviewProblem, topReviews, ratingLine } from '@/utils/placeReviews';

describe('reviewId', () => {
  it('one review per person per place', () => {
    expect(reviewId('ChIJabc', 'u1')).toBe('ChIJabc_u1');
  });
});

describe('reviewProblem', () => {
  it('needs stars, words or photos', () => {
    expect(reviewProblem({ rating: null, text: '  ', photoCount: 0 })).toBe('Add stars, a few words, or a photo.');
    expect(reviewProblem({ rating: 5, text: '', photoCount: 0 })).toBeNull();
    expect(reviewProblem({ rating: null, text: '', photoCount: 2 })).toBeNull();
  });
  it('keeps to the limits', () => {
    expect(reviewProblem({ rating: 6, text: '', photoCount: 0 })).toBe('Pick between 1 and 5 stars.');
    expect(reviewProblem({ rating: 4, text: 'x'.repeat(1001), photoCount: 0 })).toBe('Keep it under 1,000 characters.');
    expect(reviewProblem({ rating: 4, text: '', photoCount: 7 })).toBe('Up to 6 photos.');
  });
});

describe('topReviews', () => {
  it('people who visited first, then newest', () => {
    const list = [
      { id: 'a', visited: false, updatedAtMs: 30 },
      { id: 'b', visited: true, updatedAtMs: 10 },
      { id: 'c', visited: true, updatedAtMs: 20 },
      { id: 'd', visited: false, updatedAtMs: 40 },
    ];
    expect(topReviews(list, 3).map((x) => x.id)).toEqual(['c', 'b', 'd']);
  });
});

describe('ratingLine', () => {
  it('reads like a rating', () => {
    expect(ratingLine({ ratingSum: 23, ratingCount: 5, reviewCount: 6 })).toBe('4.6 · 6 reviews');
    expect(ratingLine({ ratingSum: 0, ratingCount: 0, reviewCount: 1 })).toBe('1 review');
    expect(ratingLine({ ratingSum: 0, ratingCount: 0, reviewCount: 0 })).toBe('');
  });
});
