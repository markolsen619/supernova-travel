import { claimCoverRefresh } from '@/utils/coverRefresh';

describe('claimCoverRefresh (a failed cover asks the server once per session)', () => {
  it('the first failure for a cover asks; later ones and other screens showing it do not', () => {
    const asked = new Set<string>();
    expect(claimCoverRefresh(asked, 'trip', 'T1')).toBe(true);
    expect(claimCoverRefresh(asked, 'trip', 'T1')).toBe(false);
    expect(claimCoverRefresh(asked, 'destination', 'T1')).toBe(true);
  });
  it('nothing to ask without an id', () => {
    expect(claimCoverRefresh(new Set(), 'trip', '')).toBe(false);
  });
});
