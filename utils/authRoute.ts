export type AuthRoute =
  | '/(tabs)'
  | '/(auth)/welcome'
  | '/(auth)/onboarding'
  | '/(auth)/complete-profile';

export type AuthRouteState = {
  isAuthenticated: boolean;
  hasProfile: boolean;
  onboardingComplete: boolean;
};

/**
 * Single source of truth for post-auth routing.
 *
 * The profile check comes before onboarding deliberately: an account with no
 * users/{uid} document cannot enter the app, whatever its onboarding flag says.
 * That covers first-time OAuth sign-in, an abandoned complete-profile session,
 * and an email sign-up whose setDoc failed after the account was created.
 */
export function resolveAuthRoute({
  isAuthenticated,
  hasProfile,
  onboardingComplete,
}: AuthRouteState): AuthRoute {
  if (!isAuthenticated) return '/(auth)/welcome';
  if (!hasProfile) return '/(auth)/complete-profile';
  return onboardingComplete ? '/(tabs)' : '/(auth)/onboarding';
}
