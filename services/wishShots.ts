/**
 * Screenshots for the wish list (spec 2026-11-11): re-encode (JPEG, ≤ 1600 px, no metadata — never the original),
 * upload to the user's private folder, ask the server to read them, and delete them with the save.
 */
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { functions, storage } from '@/services/firebase';
import { PHOTO_QUALITY, SHOT_MAX_PX, uploadResize } from '@/utils/photoUpload';
import type { WishPlace } from '@/utils/wishlist';

async function shotJpeg(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = uploadResize(original.width, original.height, SHOT_MAX_PX);
  const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
  return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
}

export async function uploadShots(uid: string, saveId: string, uris: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, uri] of uris.slice(0, 5).entries()) {
    const jpeg = await shotJpeg(uri); // throws rather than uploading the original (it may carry a location)
    const blob = await fetch(jpeg).then((r) => r.blob());
    const path = `wish_shots/${uid}/${saveId}/${i}.jpg`;
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
    paths.push(path);
  }
  return paths;
}

export async function readScreenshots(saveId: string, count: number) {
  const { data } = await httpsCallable<{ saveId: string; count: number }, { city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: WishPlace[] }>(
    functions, 'readScreenshots', { timeout: 60_000 })({ saveId, count });
  return data;
}

export async function deleteShots(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
}
