import { followRequestId, privacyTransition, postVisibilityOnCreate } from '../../functions/src/privacy';

describe('followRequestId', () => {
  it('is requester_target', () => expect(followRequestId('a', 'b')).toBe('a_b'));
});

describe('privacyTransition', () => {
  const docs = [
    { id: 'pub', visibility: 'public' },
    { id: 'fol', visibility: 'followers' },               // owner chose followers-only
    { id: 'prv', visibility: 'private' },
    { id: 'old' },                                          // a post from before posts had visibility
  ];
  it('going private: public (or unset) becomes followers, remembering it was public', () => {
    expect(privacyTransition(true, docs)).toEqual([
      { id: 'pub', visibility: 'followers', publicWhenAccountPublic: true },
      { id: 'old', visibility: 'followers', publicWhenAccountPublic: true },
    ]);
  });
  it('going public: restores only what it flipped', () => {
    const flipped = [
      { id: 'pub', visibility: 'followers', publicWhenAccountPublic: true },
      { id: 'fol', visibility: 'followers' },
      { id: 'prv', visibility: 'private' },
    ];
    expect(privacyTransition(false, flipped)).toEqual([{ id: 'pub', visibility: 'public', publicWhenAccountPublic: false }]);
  });
  it('is idempotent — running it twice changes nothing the second time', () => {
    const once = privacyTransition(true, docs);
    const after = docs.map((d) => once.find((u) => u.id === d.id) ?? d);
    expect(privacyTransition(true, after)).toEqual([]);
  });
});

describe('postVisibilityOnCreate', () => {
  it('fills in visibility for posts from older apps', () => {
    expect(postVisibilityOnCreate({}, false)).toBe('public');
    expect(postVisibilityOnCreate({}, true)).toBe('followers');
  });
  it('makes a public post followers-only when its author is private, and leaves the rest', () => {
    expect(postVisibilityOnCreate({ visibility: 'public' }, true)).toBe('followers');
    expect(postVisibilityOnCreate({ visibility: 'public' }, false)).toBeNull();
    expect(postVisibilityOnCreate({ visibility: 'followers' }, false)).toBeNull();
  });
});
