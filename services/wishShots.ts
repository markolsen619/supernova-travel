/**
 * Screenshots for the wish list (spec 2026-11-11): re-encode (JPEG, ≤ 1600 px, no metadata — never the original),
 * upload to the user's private folder, ask the server to read them, and delete them with the save.
 */
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { functions, storage } from '@/services/firebase';
import { PHOTO_QUALITY, SHOT_MAX_PX, uploadResize } from '@/utils/photoUpload';
import type { WishPlace } from '@/utils/wishlist';
import { shotUploadPlan } from '@/utils/wishShots';

async function shotJpeg(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = uploadResize(original.width, original.height, SHOT_MAX_PX);
  const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
  return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
}

/**
 * Uploads what isn't up yet (`shotUploadPlan`), reporting each image as it lands so a dropped connection never leaves an
 * unrecorded file (it would be orphaned, and its re-upload refused). Returns every uploaded path, in order.
 */
export async function uploadShots(uid: string, saveId: string, uris: string[], done: string[], onUploaded: (path: string) => void, stopped: () => boolean = () => false): Promise<string[]> {
  for (const { uri, path } of shotUploadPlan(uid, saveId, uris, done)) {
    if (stopped()) throw new Error('closed');
    const jpeg = await shotJpeg(uri); // throws rather than uploading the original (it may carry a location)
    const blob = await fetch(jpeg).then((r) => r.blob());
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
    // Closed while this one was uploading (fresh review I-3): the sheet's cleanup already ran, so delete it here.
    if (stopped()) { await deleteObject(ref(storage, path)).catch(() => {}); throw new Error('closed'); }
    onUploaded(path);
  }
  return shotUploadPlan(uid, saveId, uris, []).map((x) => x.path);
}

export async function readScreenshots(saveId: string, count: number) {
  const { data } = await httpsCallable<{ saveId: string; count: number }, { city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: WishPlace[] }>(
    functions, 'readScreenshots', { timeout: 60_000 })({ saveId, count });
  return data;
}

export async function deleteShots(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
}

/** Pick up to 5 screenshots (the system picker; never full library access). [] when cancelled. */
export async function pickShots(): Promise<string[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 });
  return r.canceled ? [] : r.assets.map((a) => a.uri).slice(0, 5);
}
