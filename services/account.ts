import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import { revokeAppleSignIn, signOutGoogle } from '@/services/oauth';
import { logOutRevenueCat } from '@/services/revenuecat';

/**
 * Permanently deletes the signed-in account (functions/src/deleteAccount.ts),
 * then clears the device's sessions.
 *
 * An account that used Sign in with Apple has its Apple tokens revoked first,
 * as Apple requires; that step asks the user to confirm with Apple, and
 * backing out of it cancels the deletion. A revocation that fails for any
 * other reason is logged and deletion goes ahead: being unable to delete an
 * account at all would break the same App Store rule deletion exists for.
 *
 * The sign-out matters even though the server has already deleted the Auth
 * user: the client keeps a valid ID token until it next refreshes, and the
 * Google and RevenueCat SDKs keep their own sessions. auth.signOut() fires the
 * root layout's listener, which routes to the welcome screen.
 *
 * Throws if the server didn't finish. The account is then still signed in and
 * partly deleted, and calling this again picks up where it stopped.
 */
export async function deleteAccount(): Promise<'deleted' | 'cancelled'> {
  try {
    if ((await revokeAppleSignIn()) === 'cancelled') return 'cancelled';
  } catch (error) {
    console.warn('[account] Apple token revocation failed; deleting anyway:', error);
  }

  // Deleting a large account can take well past the 70s default.
  const fn = httpsCallable<undefined, { deleted: true }>(functions, 'deleteAccount', {
    timeout: 540_000,
  });
  await fn();

  await Promise.allSettled([signOutGoogle(), logOutRevenueCat()]);
  await auth.signOut();
  return 'deleted';
}
