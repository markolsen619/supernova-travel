// Relative path, not @/: functions/ is a separate npm package, and pushData.ts
// is kept free of firebase-admin imports so it can be tested here.
import { pushDataFor } from '../../functions/src/pushData';

describe('pushDataFor', () => {
  it('carries the type and the one id the client needs to route', () => {
    expect(
      pushDataFor({
        type: 'trip_invite',
        tripId: 't1',
        tripTitle: 'Lisbon',
        inviterName: 'Sam Rivera',
        inviterAvatarUrl: 'https://example.com/a.jpg',
      }),
    ).toEqual({ type: 'trip_invite', tripId: 't1' });
  });

  it('drops the display fields rather than copying the whole doc — Expo caps a push payload at 4KiB', () => {
    const data = pushDataFor({ type: 'post_comment', postId: 'p1', commenterName: 'Sam' });
    expect(data).not.toHaveProperty('commenterName');
    expect(data).toEqual({ type: 'post_comment', postId: 'p1' });
  });

  it('passes through the type alone when the doc carries no routable id', () => {
    expect(pushDataFor({ type: 'system_notice' })).toEqual({ type: 'system_notice' });
  });

  it('returns undefined without a usable type, so no empty data field is sent', () => {
    expect(pushDataFor({ tripId: 't1' })).toBeUndefined();
    expect(pushDataFor({ type: 42, tripId: 't1' })).toBeUndefined();
  });

  it('ignores ids that are empty or the wrong type', () => {
    expect(pushDataFor({ type: 'direct', threadId: '' })).toEqual({ type: 'direct' });
    expect(pushDataFor({ type: 'post_like', postId: 7 })).toEqual({ type: 'post_like' });
  });
});

describe('follow notifications', () => {
  it('carries profileUid so a follow request opens the right profile', () => {
    expect(pushDataFor({ type: 'follow_request', profileUid: 'u1', requesterName: 'Ana' })).toEqual({ type: 'follow_request', profileUid: 'u1' });
  });
});

describe('email import push data', () => {
it('carries the email import ids', () => {
  expect(pushDataFor({ type: 'email_import_reservation', reservationId: 'r1', body: 'long text' }))
    .toEqual({ type: 'email_import_reservation', reservationId: 'r1' });
  expect(pushDataFor({ type: 'email_import_batch', emailImportId: 'e1' })).toEqual({ type: 'email_import_batch', emailImportId: 'e1' });
});
});

describe('pushDataFor loyalty', () => {
  it('carries the program id', () => {
    expect(pushDataFor({ type: 'email_import_loyalty', programId: 'l1', title: 'Balance updated' })).toEqual({ type: 'email_import_loyalty', programId: 'l1' });
  });
});
