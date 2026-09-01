// services/profile.ts also exports createUserProfile, which imports `db` from
// @/services/firebase at module scope. That module pulls in AsyncStorage,
// which isn't available under Jest's node test environment. Mock the same
// way __tests__/hooks/useEditPost.test.ts does — this only unblocks module
// loading, it does not exercise Firestore.
jest.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

import { buildUserProfile } from '@/services/profile';

describe('buildUserProfile', () => {
  const profile = buildUserProfile({ fullName: '  Mark Olsen  ', username: 'markolsen' });

  it('trims the full name', () => {
    expect(profile.fullName).toBe('Mark Olsen');
  });

  it('carries the username through', () => {
    expect(profile.username).toBe('markolsen');
  });

  it('defaults new accounts to the free tier', () => {
    expect(profile.tier).toBe('free');
  });

  it('zeroes the social counters', () => {
    expect(profile.followersCount).toBe(0);
    expect(profile.followingCount).toBe(0);
  });

  it('starts with empty optional fields', () => {
    expect(profile.avatarUrl).toBeNull();
    expect(profile.bio).toBe('');
    expect(profile.location).toBe('');
  });

  it('seeds settings and usage sub-objects', () => {
    expect(profile.settings).toEqual({ theme: 'dark', notificationsEnabled: true, privacy: 'public' });
    expect(profile.usage).toEqual({ weeklyAiTrips: 0, weeklyResetAt: null });
  });

  it('accepts an empty username for a failed claim', () => {
    expect(buildUserProfile({ fullName: 'A', username: '' }).username).toBe('');
  });
});
