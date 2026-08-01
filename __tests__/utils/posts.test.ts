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
    // Explicit annotation, not inferred: a bare `{ id: '1' }` shares no
    // property names with `{ mediaType?: string }`, and TypeScript's "weak
    // type" check rejects that under --strict even though it's structurally
    // valid (every real PostDoc declares `mediaType` as a key, so this only
    // bites this all-optional test fixture).
    const posts: { id: string; mediaType?: string }[] = [{ id: '1' }];
    expect(excludeTripShares(posts)).toEqual(posts);
  });

  it('returns an empty array unchanged', () => {
    expect(excludeTripShares([])).toEqual([]);
  });
});
