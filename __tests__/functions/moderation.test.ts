// Relative path, not @/: functions/ is its own package, and moderation.ts is
// kept free of firebase-admin so it can be tested here.
import {
  AUTO_HIDE_THRESHOLD,
  autoHidePath,
  moderatorPush,
  parseModeratorUids,
  shouldAutoHide,
} from '../../functions/src/moderation';

describe('autoHidePath', () => {
  it('points at posts, trips, and comments under their post', () => {
    expect(autoHidePath({ targetType: 'post', targetId: 'p1' })).toBe('posts/p1');
    expect(autoHidePath({ targetType: 'trip', targetId: 't1' })).toBe('trips/t1');
    expect(autoHidePath({ targetType: 'comment', targetId: 'c1', targetParentId: 'p1' })).toBe('posts/p1/comments/c1');
  });

  it('never auto-hides accounts or messages, which a person reviews', () => {
    expect(autoHidePath({ targetType: 'user', targetId: 'bob' })).toBeNull();
    expect(autoHidePath({ targetType: 'message', targetId: 'm1', targetParentId: 'th1' })).toBeNull();
  });

  it('refuses malformed reports rather than guessing a path', () => {
    expect(autoHidePath({ targetType: 'comment', targetId: 'c1' })).toBeNull();
    expect(autoHidePath({ targetType: 'post', targetId: '' })).toBeNull();
    expect(autoHidePath({ targetType: 'post' })).toBeNull();
  });
});

describe('shouldAutoHide', () => {
  it('waits for the threshold of distinct reporters', () => {
    expect(shouldAutoHide(AUTO_HIDE_THRESHOLD - 1)).toBe(false);
    expect(shouldAutoHide(AUTO_HIDE_THRESHOLD)).toBe(true);
    expect(shouldAutoHide(AUTO_HIDE_THRESHOLD + 5)).toBe(true);
  });
});

describe('parseModeratorUids', () => {
  it('splits, trims, and de-duplicates', () => {
    expect(parseModeratorUids(' a , b,,a ')).toEqual(['a', 'b']);
  });

  it('is empty when unset', () => {
    expect(parseModeratorUids(undefined)).toEqual([]);
    expect(parseModeratorUids('')).toEqual([]);
  });
});

describe('moderatorPush', () => {
  it('names the type, reason, and count, without the reporter', () => {
    const push = moderatorPush({ targetType: 'post', targetId: 'p1', reason: 'hate', reporterUid: 'secret' }, 1);
    expect(push).toEqual({ title: 'New report: post', body: 'Hate speech or symbols · 1 report' });
    expect(JSON.stringify(push)).not.toContain('secret');
  });

  it('says when the report tipped content into auto-hide', () => {
    expect(moderatorPush({ targetType: 'comment', targetId: 'c1', targetParentId: 'p1', reason: 'spam' }, 3).body).toBe(
      'Spam or scam · 3 reports · auto-hidden',
    );
  });

  it("doesn't claim auto-hide for types that are never auto-hidden", () => {
    expect(moderatorPush({ targetType: 'user', targetId: 'bob', reason: 'spam' }, 9).body).toBe('Spam or scam · 9 reports');
  });
});
