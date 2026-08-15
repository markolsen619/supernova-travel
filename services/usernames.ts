import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/services/firebase';

// Lowercase letters, digits, underscore and dot; 3–20 chars. Mirrors the
// claim-doc ID format in firestore.rules (`usernames/{username}`).
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

export function validateUsernameFormat(username: string): string | null {
  // empty = "keep none", validated at save if required. UsernameField's
  // handleChangeText depends on this returning null for '' to correctly
  // report a cleared field as non-blocking — changing this branch requires
  // updating that coupling too (see the comment there).
  if (username.length === 0) return null;
  if (username.length < 3) return 'At least 3 characters.';
  if (username.length > 20) return 'At most 20 characters.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Lowercase letters, numbers, dots, and underscores only.';
  }
  return null;
}

/**
 * Returns true when `username` is free (or already claimed by `forUid`).
 * The `usernames` collection is publicly readable (firestore.rules) — plain
 * existence/ownership checks, not sensitive — specifically so this works
 * BEFORE a sign-up account exists (no auth yet to gate the read).
 */
export async function checkUsernameAvailability(username: string, forUid?: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'usernames', username));
  return !snap.exists() || snap.data().uid === forUid;
}

export type ClaimResult = 'ok' | 'taken';

/**
 * Atomically claim `newUsername` for `uid` and release `oldUsername` (if
 * any) in one transaction. Safe to call with `oldUsername: ''` for a
 * brand-new account — the release step is skipped.
 *
 * Enforced at two layers: this transaction re-reads the claim doc (source of
 * truth, closes the TOCTOU gap a live-typing check alone would leave), and
 * firestore.rules forbids updating an existing claim, so even a racing
 * transaction cannot overwrite another user's name.
 */
export async function claimUsername(uid: string, newUsername: string, oldUsername: string): Promise<ClaimResult> {
  try {
    await runTransaction(db, async (tx) => {
      const claimRef = doc(db, 'usernames', newUsername);
      const claim = await tx.get(claimRef);
      if (claim.exists() && claim.data().uid !== uid) {
        throw new Error('username-taken');
      }
      if (!claim.exists()) {
        tx.set(claimRef, { uid });
      }
      if (oldUsername && oldUsername !== newUsername) {
        tx.delete(doc(db, 'usernames', oldUsername));
      }
    });
    return 'ok';
  } catch (err) {
    if (err instanceof Error && err.message === 'username-taken') return 'taken';
    throw err;
  }
}
