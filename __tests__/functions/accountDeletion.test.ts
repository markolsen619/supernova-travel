// Reached by relative path, not the @/ alias: functions/ is a separate npm
// package, and accountDeletion.ts is kept free of firebase-admin imports so it
// can be tested here.
import {
  decrementCount,
  invitedTripIds,
  threadRemoval,
  userStoragePrefixes,
} from '../../functions/src/accountDeletion';

describe('userStoragePrefixes', () => {
  it('covers every per-user folder in storage.rules, each scoped with a trailing slash', () => {
    expect(userStoragePrefixes('abc')).toEqual([
      'posts/abc/',
      'profile_photos/abc/',
      'journal_photos/abc/',
      'reservations/abc/',
    ]);
  });

  it("never includes the shared places cache", () => {
    expect(userStoragePrefixes('abc').some((p) => p.startsWith('places/'))).toBe(false);
  });

  it('cannot match another user whose uid starts with this one', () => {
    // "abc/" must not prefix "abcd/..." — the trailing slash is what prevents it.
    expect(userStoragePrefixes('abc').every((p) => !'posts/abcd/photo.jpg'.startsWith(p))).toBe(true);
  });
});

describe('threadRemoval', () => {
  it('deletes a one-to-one thread, which would otherwise be a conversation with no one', () => {
    expect(threadRemoval(['me', 'them'], 'them', 'me')).toEqual({ kind: 'delete-thread' });
  });

  it('leaves a group, keeping everyone else', () => {
    expect(threadRemoval(['me', 'a', 'b'], 'a', 'me')).toEqual({
      kind: 'leave-thread',
      participants: ['a', 'b'],
      clearPreview: false,
    });
  });

  it('clears the inbox preview when it quotes the departing user', () => {
    expect(threadRemoval(['me', 'a', 'b'], 'me', 'me')).toMatchObject({ clearPreview: true });
  });

  it('handles a thread with no messages yet', () => {
    expect(threadRemoval(['me', 'a', 'b'], null, 'me')).toMatchObject({ clearPreview: false });
  });
});

describe('decrementCount', () => {
  it('subtracts one', () => {
    expect(decrementCount(5)).toBe(4);
  });

  it('never goes below zero', () => {
    expect(decrementCount(0)).toBe(0);
  });

  it('treats a missing or malformed counter as zero', () => {
    expect(decrementCount(undefined)).toBe(0);
    expect(decrementCount('3')).toBe(0);
    expect(decrementCount(NaN)).toBe(0);
  });
});

describe('invitedTripIds', () => {
  it('collects trip ids from invite notifications only, once each', () => {
    expect(
      invitedTripIds([
        { type: 'trip_invite', tripId: 't1' },
        { type: 'post_like', tripId: 't2' },
        { type: 'trip_invite', tripId: 't1' },
        { type: 'trip_invite', tripId: 't3' },
      ]),
    ).toEqual(['t1', 't3']);
  });

  it('skips invites without a usable trip id', () => {
    expect(invitedTripIds([{ type: 'trip_invite' }, { type: 'trip_invite', tripId: '' }])).toEqual([]);
  });
});
