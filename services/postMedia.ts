import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/services/firebase';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PHOTO_QUALITY, uploadResize } from '@/utils/photoUpload';

/** A picked photo as an upright JPEG, long side ≤ 2048, no metadata (utils/photoUpload.ts). Falls back to the original if the device can't re-encode it. */
async function webJpeg(uri: string): Promise<string> {
  try {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const resize = uploadResize(original.width, original.height);
    const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
    const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  } catch (error) {
    console.warn('[postMedia] could not convert the photo; uploading it as picked', error);
    return uri;
  }
}

/** Uploads one local image URI to `posts/{uid}/{timestamp}_{index}.jpg` in
 * Storage and resolves its download URL. Shared by post creation
 * (useCreatePost) and post editing (useEditPost) so both write to the same
 * path convention and error format. */
export async function uploadPostImage(uid: string, uri: string, index: number): Promise<string> {
  const blob = await fetch(await webJpeg(uri)).then((r) => r.blob());
  const storageRef = ref(storage, `posts/${uid}/${Date.now()}_${index}.jpg`);
  const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });
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

/** Uploads a local file to `path` with its content type, reporting 0–1 progress; resolves the download URL. */
export async function uploadPostFile(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (err) => reject(new Error(`Storage upload failed: ${err.message}`)),
      resolve,
    );
  });
  return getDownloadURL(storageRef);
}
