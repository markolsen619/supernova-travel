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
