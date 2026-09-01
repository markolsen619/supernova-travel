import { resolveAuthRoute } from '@/utils/authRoute';

describe('resolveAuthRoute', () => {
  it('sends signed-out users to welcome', () => {
    expect(resolveAuthRoute({ isAuthenticated: false, hasProfile: false, onboardingComplete: false }))
      .toBe('/(auth)/welcome');
  });

  it('ignores profile state when signed out', () => {
    expect(resolveAuthRoute({ isAuthenticated: false, hasProfile: true, onboardingComplete: true }))
      .toBe('/(auth)/welcome');
  });

  it('sends authenticated users with no profile to complete-profile', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: false, onboardingComplete: false }))
      .toBe('/(auth)/complete-profile');
  });

  it('gates on profile even when onboarding was already completed', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: false, onboardingComplete: true }))
      .toBe('/(auth)/complete-profile');
  });

  it('sends profiled users who have not onboarded to onboarding', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: true, onboardingComplete: false }))
      .toBe('/(auth)/onboarding');
  });

  it('sends fully set-up users to tabs', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: true, onboardingComplete: true }))
      .toBe('/(tabs)');
  });
});
