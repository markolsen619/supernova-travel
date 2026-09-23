import { resolveNotificationRoute } from '@/utils/notificationRoute';

describe('resolveNotificationRoute', () => {
  it('sends a like or a comment to the post it happened on', () => {
    expect(resolveNotificationRoute({ type: 'post_like', postId: 'p1' })).toBe('/post/p1');
    expect(resolveNotificationRoute({ type: 'post_comment', postId: 'p1' })).toBe('/post/p1');
  });

  it('sends both sides of a trip invite to the trip', () => {
    expect(resolveNotificationRoute({ type: 'trip_invite', tripId: 't1' })).toBe('/trip/t1');
    expect(resolveNotificationRoute({ type: 'trip_invite_accepted', tripId: 't1' })).toBe('/trip/t1');
  });

  it('sends a DM to its thread', () => {
    expect(resolveNotificationRoute({ type: 'direct', threadId: 'th1' })).toBe('/messages/th1');
  });

  it('sends a flight update to the boarding pass, group-qualified like the rest of the app', () => {
    expect(resolveNotificationRoute({ type: 'flight_status', passId: 'bp1' })).toBe(
      '/(wallet)/boarding-pass/bp1',
    );
  });

  it('returns null for a type this build does not know, so an older app opens the feed instead of crashing', () => {
    expect(resolveNotificationRoute({ type: 'trip_comment_reaction', tripId: 't1' })).toBeNull();
  });

  it('returns null when the id the route needs is missing', () => {
    expect(resolveNotificationRoute({ type: 'post_like' })).toBeNull();
    expect(resolveNotificationRoute({ type: 'direct', threadId: '' })).toBeNull();
  });

  it('returns null for anything that is not a payload object — Expo hands back {} for a local notification', () => {
    expect(resolveNotificationRoute(undefined)).toBeNull();
    expect(resolveNotificationRoute(null)).toBeNull();
    expect(resolveNotificationRoute({})).toBeNull();
    expect(resolveNotificationRoute('post_like')).toBeNull();
  });

  it('ignores an id of the wrong type rather than interpolating it into a route', () => {
    expect(resolveNotificationRoute({ type: 'post_like', postId: 42 })).toBeNull();
  });
});
