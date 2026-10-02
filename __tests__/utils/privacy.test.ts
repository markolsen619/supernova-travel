import { isPrivateAccount, profileAccess, followButtonState, publicAllowed, newPostVisibility, canSeePost } from '@/utils/privacy';

describe('isPrivateAccount', () => {
  it('reads settings.privacy, defaulting to public', () => {
    expect(isPrivateAccount({ settings: { privacy: 'private' } })).toBe(true);
    expect(isPrivateAccount({ settings: { privacy: 'public' } })).toBe(false);
    expect(isPrivateAccount({})).toBe(false);
    expect(isPrivateAccount(null)).toBe(false);
  });
});

describe('profileAccess', () => {
  const base = { viewerUid: 'me', ownerUid: 'them', isPrivate: true, viewerFollows: false };
  it('locks a private account to a non-follower', () => expect(profileAccess(base)).toBe('locked'));
  it('opens it to a follower, to its owner, and when it is public', () => {
    expect(profileAccess({ ...base, viewerFollows: true })).toBe('full');
    expect(profileAccess({ ...base, viewerUid: 'them' })).toBe('full');
    expect(profileAccess({ ...base, isPrivate: false })).toBe('full');
  });
});

describe('followButtonState', () => {
  const b = { isSelf: false, isFollowing: false, hasRequested: false, targetPrivate: false };
  it('is Follow on a public account and Request on a private one', () => {
    expect(followButtonState(b)).toBe('follow');
    expect(followButtonState({ ...b, targetPrivate: true })).toBe('request');
  });
  it('shows Requested while a request is pending, and Following once accepted', () => {
    expect(followButtonState({ ...b, targetPrivate: true, hasRequested: true })).toBe('requested');
    expect(followButtonState({ ...b, targetPrivate: true, isFollowing: true, hasRequested: true })).toBe('following');
  });
  it('has nothing to show on your own profile', () => expect(followButtonState({ ...b, isSelf: true, isFollowing: true })).toBe('self'));
});

describe('publicAllowed', () => {
  it('turns off Public in visibility pickers while the account is private', () => {
    expect(publicAllowed(true)).toBe(false);
    expect(publicAllowed(false)).toBe(true);
  });
});

describe('newPostVisibility', () => {
  it("is public, or followers-only (remembered as public) while the author is private", () => {
    expect(newPostVisibility(false)).toEqual({ visibility: 'public' });
    expect(newPostVisibility(true)).toEqual({ visibility: 'followers', publicWhenAccountPublic: true });
  });
});

describe('canSeePost', () => {
  it('shows followers-only posts to the author and followers, public posts to everyone', () => {
    expect(canSeePost('followers', { isAuthor: false, follows: false })).toBe(false);
    expect(canSeePost('followers', { isAuthor: false, follows: true })).toBe(true);
    expect(canSeePost('followers', { isAuthor: true, follows: false })).toBe(true);
    expect(canSeePost('public', { isAuthor: false, follows: false })).toBe(true);
    expect(canSeePost(undefined, { isAuthor: false, follows: false })).toBe(true); // posts from before visibility
  });
});
