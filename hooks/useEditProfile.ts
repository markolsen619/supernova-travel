import { useCallback, useState } from 'react';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateProfile as updateAuthProfile } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';

// Lowercase letters, digits, underscore and dot; 3–20 chars. Mirrors the
// claim-doc ID format in firestore.rules (`usernames/{username}`).
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

export function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return null; // empty = "keep none", validated at save if required
  if (username.length < 3) return 'At least 3 characters.';
  if (username.length > 20) return 'At most 20 characters.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Lowercase letters, numbers, dots, and underscores only.';
  }
  return null;
}

export interface SaveProfileInput {
  displayName: string;
  username: string;
  bio: string;
  location: string;
}

/**
 * Profile mutations: avatar upload (Storage) + profile save with atomic
 * username claim/release (Firestore transaction against `usernames/{name}`).
 *
 * Username uniqueness is enforced at three layers:
 * 1. inline availability check (`checkUsernameAvailable`) for live feedback,
 * 2. the save transaction re-reads the claim doc (source of truth),
 * 3. firestore.rules forbids updating an existing claim, so even a racing
 *    transaction cannot overwrite another user's name.
 */
export function useEditProfile() {
  const user = useAuthStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Returns true when `username` is free (or already ours). */
  const checkUsernameAvailable = useCallback(
    async (username: string): Promise<boolean> => {
      if (!user) return false;
      const snap = await getDoc(doc(db, 'usernames', username));
      return !snap.exists() || snap.data().uid === user.uid;
    },
    [user],
  );

  /**
   * Pick from the photo library, compress, upload to
   * `profile_photos/{uid}/…` (Storage rules owner-gate this path), persist
   * the URL on the user doc, and reflect it in the local stores.
   * Returns an error message for inline display, or null on success/cancel.
   */
  const pickAndUploadAvatar = useCallback(async (): Promise<string | null> => {
    if (!user) return 'Sign in to change your photo.';

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return 'Photo access is off. Enable it in iOS Settings to change your photo.';
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Compression happens here — quality 0.6 keeps a square avatar well
      // under a megabyte. (Dimension resizing via expo-image-manipulator is
      // a native module not in the current dev client — deferred to the
      // next EAS build.)
      quality: 0.6,
      exif: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return null;

    setUploadingAvatar(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const avatarRef = ref(storage, `profile_photos/${user.uid}/avatar_${Date.now()}.jpg`);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(avatarRef, blob, { contentType: 'image/jpeg' });
        task.on('state_changed', undefined, reject, () => resolve());
      });
      const url = await getDownloadURL(avatarRef);

      await runTransaction(db, async (tx) => {
        tx.update(doc(db, 'users', user.uid), { avatarUrl: url, updatedAt: serverTimestamp() });
      });
      if (auth.currentUser) {
        await updateAuthProfile(auth.currentUser, { photoURL: url });
      }
      if (profile) setProfile({ ...profile, avatarUrl: url });
      return null;
    } catch (err) {
      console.error('[useEditProfile] avatar upload failed:', err);
      return "Couldn't upload that photo. Check your connection and try again.";
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, profile, setProfile]);

  /**
   * Save profile fields. When the username changed, claim the new name and
   * release the old one atomically with the user-doc update.
   * Returns an error message for inline display, or null on success.
   */
  const saveProfile = useCallback(
    async (input: SaveProfileInput): Promise<string | null> => {
      if (!user) return 'Sign in to edit your profile.';
      const displayName = input.displayName.trim();
      if (!displayName) return 'Add a display name.';

      const newUsername = input.username.trim().toLowerCase();
      const oldUsername = profile?.username ?? '';
      if (newUsername) {
        const formatError = validateUsernameFormat(newUsername);
        if (formatError) return formatError;
      }

      setSaving(true);
      try {
        await runTransaction(db, async (tx) => {
          const userRef = doc(db, 'users', user.uid);

          if (newUsername && newUsername !== oldUsername) {
            const claimRef = doc(db, 'usernames', newUsername);
            const claim = await tx.get(claimRef);
            if (claim.exists() && claim.data().uid !== user.uid) {
              throw new Error('username-taken');
            }
            if (!claim.exists()) {
              tx.set(claimRef, { uid: user.uid });
            }
            if (oldUsername) {
              tx.delete(doc(db, 'usernames', oldUsername));
            }
          }

          tx.update(userRef, {
            displayName,
            username: newUsername || oldUsername,
            bio: input.bio.trim(),
            location: input.location.trim(),
            updatedAt: serverTimestamp(),
          });
        });

        if (auth.currentUser && auth.currentUser.displayName !== displayName) {
          await updateAuthProfile(auth.currentUser, { displayName });
        }
        if (profile) {
          setProfile({
            ...profile,
            displayName,
            username: newUsername || oldUsername,
            bio: input.bio.trim(),
            location: input.location.trim(),
          });
        }
        return null;
      } catch (err) {
        if (err instanceof Error && err.message === 'username-taken') {
          return 'That username is taken.';
        }
        console.error('[useEditProfile] save failed:', err);
        return "Couldn't save your changes. Try again in a moment.";
      } finally {
        setSaving(false);
      }
    },
    [user, profile, setProfile],
  );

  return { pickAndUploadAvatar, saveProfile, checkUsernameAvailable, uploadingAvatar, saving };
}
