// services/session.ts also exports hydrateSession, which pulls in `db` from
// @/services/firebase and the AsyncStorage native module at module scope —
// neither is available under Jest's node test environment. Mock both the
// same way __tests__/services/profile.test.ts and
// __tests__/hooks/useEditPost.test.ts mock @/services/firebase — this only
// unblocks module loading, it does not exercise Firestore or AsyncStorage.
jest.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { resolveHasSeenOnboarding } from '@/services/session';

describe('resolveHasSeenOnboarding', () => {
  it('returns true for a current-shape doc with hasSeenOnboarding: true', () => {
    expect(resolveHasSeenOnboarding({ fullName: 'Mark', hasSeenOnboarding: true }, false)).toBe(true);
  });

  it('returns false for a current-shape doc missing the field, no legacy flag', () => {
    expect(resolveHasSeenOnboarding({ fullName: 'Mark' }, false)).toBe(false);
  });

  it('returns true for a current-shape doc missing the field when the legacy flag is present', () => {
    expect(resolveHasSeenOnboarding({ fullName: 'Mark' }, true)).toBe(true);
  });

  it('returns false for a legacy-shape doc with no hasSeenOnboarding field', () => {
    expect(resolveHasSeenOnboarding({ name: 'Mark', photoURL: 'https://example.com/a.jpg' }, false)).toBe(false);
  });

  it('returns true for a legacy-shape doc that already carries hasSeenOnboarding: true', () => {
    // The real case for 2 of 3 existing users — an earlier app version wrote
    // this field onto legacy-shape docs before the fullName/avatarUrl rename.
    expect(
      resolveHasSeenOnboarding({ name: 'Mark', photoURL: 'https://example.com/a.jpg', hasSeenOnboarding: true }, false)
    ).toBe(true);
  });

  it('returns false for a non-boolean truthy value (strict === true)', () => {
    expect(resolveHasSeenOnboarding({ hasSeenOnboarding: 'yes' }, false)).toBe(false);
  });
});
