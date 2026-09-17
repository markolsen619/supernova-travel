import {
  buildReport,
  canModerate,
  contentKey,
  filterVisible,
  isContentVisible,
  isThreadVisible,
  notificationActorUid,
  reportDocId,
  REPORT_DETAILS_MAX_LENGTH,
  type ModerationContext,
} from '@/utils/moderation';

const ctx = (blocked: string[] = [], hidden: string[] = []): ModerationContext => ({
  blockedUids: new Set(blocked),
  hiddenKeys: new Set(hidden),
});

describe('contentKey', () => {
  it('scopes comments and messages by their parent', () => {
    expect(contentKey({ type: 'comment', id: 'c1', parentId: 'p1' })).toBe('comment__p1__c1');
    expect(contentKey({ type: 'comment', id: 'c1', parentId: 'p2' })).not.toBe(
      contentKey({ type: 'comment', id: 'c1', parentId: 'p1' }),
    );
  });

  it('works without a parent, and never contains a slash', () => {
    const key = contentKey({ type: 'post', id: 'p1' });
    expect(key).toBe('post____p1');
    expect(key.includes('/')).toBe(false);
  });
});

describe('reportDocId', () => {
  it('is the same for repeat reports by one person, and different across people', () => {
    const target = { type: 'post' as const, id: 'p1', ownerUid: 'bob' };
    expect(reportDocId('alice', target)).toBe(reportDocId('alice', target));
    expect(reportDocId('alice', target)).not.toBe(reportDocId('carol', target));
  });
});

describe('canModerate', () => {
  it('refuses reporting or blocking yourself', () => {
    expect(canModerate('alice', 'alice')).toBe(false);
  });

  it('refuses when signed out or the owner is unknown', () => {
    expect(canModerate(null, 'bob')).toBe(false);
    expect(canModerate('alice', undefined)).toBe(false);
  });

  it('allows it for someone else', () => {
    expect(canModerate('alice', 'bob')).toBe(true);
  });
});

describe('buildReport', () => {
  const target = { type: 'comment' as const, id: 'c1', ownerUid: 'bob', parentId: 'p1' };

  it('builds the open report the rules expect', () => {
    expect(buildReport('alice', target, 'harassment', '  mean  ')).toEqual({
      reporterUid: 'alice',
      targetType: 'comment',
      targetId: 'c1',
      targetParentId: 'p1',
      targetOwnerUid: 'bob',
      targetKey: 'comment__p1__c1',
      reason: 'harassment',
      details: 'mean',
      status: 'open',
    });
  });

  it('stores blank details as null', () => {
    expect(buildReport('alice', target, 'spam', '   ').details).toBeNull();
    expect(buildReport('alice', target, 'spam').details).toBeNull();
  });

  it('caps details at the maximum length', () => {
    const details = buildReport('alice', target, 'other', 'x'.repeat(2000)).details;
    expect(details).toHaveLength(REPORT_DETAILS_MAX_LENGTH);
  });

  it('defaults a missing parent to null', () => {
    expect(buildReport('alice', { type: 'user', id: 'bob', ownerUid: 'bob' }, 'spam').targetParentId).toBeNull();
  });
});

describe('isContentVisible', () => {
  it('shows ordinary content', () => {
    expect(isContentVisible(ctx(), { authorUid: 'bob', key: 'post____p1' })).toBe(true);
  });

  it('hides content from someone you blocked', () => {
    expect(isContentVisible(ctx(['bob']), { authorUid: 'bob', key: 'post____p1' })).toBe(false);
  });

  it('hides content you reported', () => {
    expect(isContentVisible(ctx([], ['post____p1']), { authorUid: 'bob', key: 'post____p1' })).toBe(false);
  });

  it('hides content the server took down, for everyone', () => {
    expect(isContentVisible(ctx(), { authorUid: 'bob', moderationHidden: true })).toBe(false);
  });

  it('tolerates a missing author', () => {
    expect(isContentVisible(ctx(['bob']), { authorUid: undefined })).toBe(true);
  });
});

describe('filterVisible', () => {
  it('keeps order and drops hidden items', () => {
    const posts = [
      { id: 'p1', authorUid: 'bob' },
      { id: 'p2', authorUid: 'carol' },
      { id: 'p3', authorUid: 'dave', moderationHidden: true },
      { id: 'p4', authorUid: 'erin' },
    ];
    const visible = filterVisible(posts, ctx(['carol'], ['post____p4']), (p) => ({
      authorUid: p.authorUid,
      key: contentKey({ type: 'post', id: p.id }),
      moderationHidden: p.moderationHidden,
    }));
    expect(visible.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('notificationActorUid', () => {
  it('reads whichever actor field the notification type uses', () => {
    expect(notificationActorUid({ type: 'post_like', likerUid: 'bob' })).toBe('bob');
    expect(notificationActorUid({ type: 'post_comment', commenterUid: 'carol' })).toBe('carol');
    expect(notificationActorUid({ type: 'trip_invite', inviterUid: 'dave' })).toBe('dave');
  });

  it('returns null for notifications without an actor', () => {
    expect(notificationActorUid({ type: 'flight_status' })).toBeNull();
  });
});

describe('isThreadVisible', () => {
  it('hides a direct thread with someone you blocked', () => {
    expect(isThreadVisible({ type: 'direct', participants: ['me', 'bob'] }, 'me', ctx(['bob']))).toBe(false);
  });

  it('keeps a direct thread with anyone else', () => {
    expect(isThreadVisible({ type: 'direct', participants: ['me', 'bob'] }, 'me', ctx(['carol']))).toBe(true);
  });

  it('keeps group threads, which other people are still in', () => {
    expect(isThreadVisible({ type: 'group', participants: ['me', 'bob', 'carol'] }, 'me', ctx(['bob']))).toBe(true);
  });
});
