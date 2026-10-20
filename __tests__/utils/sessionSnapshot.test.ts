// __tests__/utils/sessionSnapshot.test.ts
import { canUseSnapshot, parseSnapshot, snapshotKey, type SessionSnapshot } from '@/utils/sessionSnapshot';

const snap: SessionSnapshot = {
  v: 1, uid: 'u1', profile: { uid: 'u1', fullName: 'Mark' }, tier: 'pro', hasSeenOnboarding: true,
  aiConsentVersion: 3, blockedUids: ['x'], hiddenKeys: ['post_1'], savedAt: 1,
};

describe('parseSnapshot', () => {
  it('round-trips a saved snapshot for the same uid', () => {
    expect(parseSnapshot(JSON.stringify(snap), 'u1')).toEqual(snap);
  });
  it('rejects another uid, bad JSON, a wrong version or nothing', () => {
    expect(parseSnapshot(JSON.stringify(snap), 'u2')).toBeNull();
    expect(parseSnapshot('{oops', 'u1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap, v: 2 }), 'u1')).toBeNull();
    expect(parseSnapshot(null, 'u1')).toBeNull();
  });
  it('namespaces the storage key by uid', () => {
    expect(snapshotKey('u1')).toBe('sessionSnapshot:u1');
  });
});

describe('canUseSnapshot', () => {
  it('is used only when the read failed, the phone is offline and a snapshot for this uid exists', () => {
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: snap, uid: 'u1' })).toBe(true);
  });
  it('keeps today\'s behaviour otherwise', () => {
    expect(canUseSnapshot({ readFailed: true, offline: false, snapshot: snap, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: false, offline: true, snapshot: snap, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: null, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: snap, uid: 'u2' })).toBe(false);
  });
});
