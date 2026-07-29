import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';

/** Uploads one local image URI to `posts/{uid}/{timestamp}_{index}.jpg` in
 * Storage and resolves its download URL. Shared by post creation
 * (useCreatePost) and post editing (useEditPost) so both write to the same
 * path convention and error format. */
export async function uploadPostImage(uid: string, uri: string, index: number): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, `posts/${uid}/${Date.now()}_${index}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      undefined,
      (err) => reject(new Error(`Storage upload failed: ${err.message}`)),
      resolve,
    );
  });
  return getDownloadURL(storageRef);
}
