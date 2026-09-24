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


// hydrateSession's collaborators. Mocked so this file can assert on what
// hydrateSession *does* (which uid it binds the purchase SDK to), without
// dragging in Firestore, expo-notifications, or the native purchases module.
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'ts'),
}));

jest.mock('@/services/revenuecat', () => ({
  configureRevenueCat: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/push', () => ({
  registerPushTokenIfGranted: jest.fn(),
}));

jest.mock('@/services/moderation', () => ({
  loadModerationState: jest.fn(),
}));

import { getDoc } from 'firebase/firestore';
import { configureRevenueCat } from '@/services/revenuecat';
import { hydrateSession, resolveHasSeenOnboarding } from '@/services/session';

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

describe('hydrateSession — binding the purchase SDK to the uid', () => {
  const user = { uid: 'uid-koda', displayName: 'Koda Bear' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds RevenueCat to the uid when the profile document already exists', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ fullName: 'Koda Bear', hasSeenOnboarding: true }),
    });

    await hydrateSession(user);

    expect(configureRevenueCat).toHaveBeenCalledWith('uid-koda');
  });

  it('binds RevenueCat to the uid even when the profile document does not exist yet', async () => {
    // The email sign-up race: createUserWithEmailAndPassword fires
    // onAuthStateChanged BEFORE createUserProfile writes users/{uid}, so the
    // first hydrateSession runs against a missing document. Nothing calls
    // hydrateSession again on that path, so if the SDK is not bound here it
    // stays on an anonymous app_user_id for the whole session — and a
    // purchase made in it reaches syncTier with no uid to map it to.
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await hydrateSession(user);

    expect(configureRevenueCat).toHaveBeenCalledWith('uid-koda');
  });

  it('still reports the profile as missing so routing sends them to complete-profile', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await expect(hydrateSession(user)).resolves.toEqual({
      hasProfile: false,
      hasSeenOnboarding: false,
    });
  });
});
