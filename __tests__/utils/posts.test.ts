import { excludeTripShares } from '@/utils/posts';

describe('excludeTripShares', () => {
  it('filters out posts with mediaType "trip"', () => {
    const posts = [
      { id: '1', mediaType: 'photo' },
      { id: '2', mediaType: 'trip' },
      { id: '3', mediaType: 'video' },
    ];
    expect(excludeTripShares(posts).map((p) => p.id)).toEqual(['1', '3']);
  });

  it('keeps posts with no mediaType set (defensive — legacy data)', () => {
    const posts = [{ id: '1' }];
    expect(excludeTripShares(posts)).toEqual(posts);
  });

  it('returns an empty array unchanged', () => {
    expect(excludeTripShares([])).toEqual([]);
  });
});
