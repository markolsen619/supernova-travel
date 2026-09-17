import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import { signOutGoogle } from '@/services/oauth';
import { logOutRevenueCat } from '@/services/revenuecat';

/**
 * Permanently deletes the signed-in account (functions/src/deleteAccount.ts),
 * then clears the device's sessions.
 *
 * The sign-out matters even though the server has already deleted the Auth
 * user: the client keeps a valid ID token until it next refreshes, and the
 * Google and RevenueCat SDKs keep their own sessions. auth.signOut() fires the
 * root layout's listener, which routes to the welcome screen.
 *
 * Throws if the server didn't finish. The account is then still signed in and
 * partly deleted, and calling this again picks up where it stopped.
 */
export async function deleteAccount(): Promise<void> {
  // Deleting a large account can take well past the 70s default.
  const fn = httpsCallable<undefined, { deleted: true }>(functions, 'deleteAccount', {
    timeout: 540_000,
  });
  await fn();

  await Promise.allSettled([signOutGoogle(), logOutRevenueCat()]);
  await auth.signOut();
}
