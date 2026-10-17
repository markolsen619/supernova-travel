import { canDeleteNotification, removeNotification } from '@/utils/notificationActions';

const notif = (over: Record<string, unknown> = {}) =>
  ({ id: 'n1', type: 'post_like', read: false, ...over }) as never;

describe('canDeleteNotification', () => {
  it('allows deleting an ordinary notification', () => {
    expect(canDeleteNotification(notif({ type: 'post_like' }), {})).toBe(true);
    expect(canDeleteNotification(notif({ type: 'post_comment' }), {})).toBe(true);
    expect(canDeleteNotification(notif({ type: 'flight_status' }), {})).toBe(true);
  });

  it('refuses a trip invite that has not been answered', () => {
    // The invite itself lives server-side on the trip, so deleting the row
    // does not destroy it — but this screen is the only place it can be
    // accepted from. Deleting it strands the user with no way back.
    expect(canDeleteNotification(notif({ id: 'i1', type: 'trip_invite' }), {})).toBe(false);
  });

  it('allows deleting a trip invite once it has been answered', () => {
    expect(canDeleteNotification(notif({ id: 'i1', type: 'trip_invite' }), { i1: 'accepted' })).toBe(true);
    expect(canDeleteNotification(notif({ id: 'i1', type: 'trip_invite' }), { i1: 'declined' })).toBe(true);
  });

  it('treats a follow request like a trip invite: kept until answered', () => {
    expect(canDeleteNotification(notif({ id: 'f1', type: 'follow_request' }), {})).toBe(false);
    expect(canDeleteNotification(notif({ id: 'f1', type: 'follow_request' }), { f1: 'declined' })).toBe(true);
  });

  it('keys the answered check on the notification being tested, not any invite', () => {
    // Answering one invite must not make a different pending invite deletable.
    expect(canDeleteNotification(notif({ id: 'i2', type: 'trip_invite' }), { i1: 'accepted' })).toBe(false);
  });
});

describe('removeNotification', () => {
  const list: { id: string }[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('drops the matching id', () => {
    expect(removeNotification(list, 'b').map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('leaves the list alone when the id is absent', () => {
    expect(removeNotification(list, 'zzz')).toHaveLength(3);
  });

  it('tolerates an undefined list', () => {
    // The optimistic update runs against whatever the query cache holds,
    // which is undefined before the first fetch resolves.
    expect(removeNotification(undefined, 'a')).toEqual([]);
  });

  it('does not mutate the original', () => {
    const copy = [...list];
    removeNotification(list, 'a');
    expect(list).toEqual(copy);
  });
});

import { inviteAnswer, followRequestAnswer, rowAnswer } from '@/utils/notificationActions';

describe('inviteAnswer (the invite doc as the server holds it)', () => {
  it('leaves the buttons for a pending invite', () => {
    expect(inviteAnswer('pending')).toBeNull();
  });
  it('reads an accepted or declined invite as answered, even in a later session', () => {
    expect(inviteAnswer('accepted')).toBe('accepted');
    expect(inviteAnswer('declined')).toBe('declined');
  });
  it('treats a missing invite (trip deleted, invite withdrawn) as no longer available', () => {
    expect(inviteAnswer('missing')).toBe('gone');
  });
});

describe('followRequestAnswer', () => {
  it('leaves the buttons while the request still exists', () => {
    expect(followRequestAnswer({ requestExists: true, theyFollow: false })).toBeNull();
  });
  it('reads a vanished request as accepted when they now follow you', () => {
    expect(followRequestAnswer({ requestExists: false, theyFollow: true })).toBe('accepted');
  });
  it('reads a vanished request with no follow as declined', () => {
    expect(followRequestAnswer({ requestExists: false, theyFollow: false })).toBe('declined');
  });
});

describe('rowAnswer', () => {
  it('prefers what you just tapped this session', () => {
    expect(rowAnswer('n1', { n1: 'declined' }, { n1: null })).toBe('declined');
  });
  it('falls back to the server answer', () => {
    expect(rowAnswer('n1', {}, { n1: 'accepted' })).toBe('accepted');
  });
  it('shows buttons while the server answer is still loading', () => {
    expect(rowAnswer('n1', {}, {})).toBeNull();
  });
});

describe('canDeleteNotification with server answers', () => {
  it('allows deleting an invite the server says was answered in an earlier session', () => {
    expect(canDeleteNotification(notif({ id: 'i1', type: 'trip_invite' }), {}, { i1: 'accepted' })).toBe(true);
  });
});
