/**
 * Key-less addresses for a place's photos (rules in utils/placePhotos.ts). Order: this session's memory, then the
 * shared `places/{placeId}` doc (anyone's lookup in the last 10 days), then Google — one billed call per photo —
 * written back for everyone. Never throws: a failure is an empty list and the sheet shows no photo rail.
 */
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { freshPhotoUris, parsePhotoUri, photoUriRequestUrl, PHOTO_RAIL_MAX } from '@/utils/placePhotos';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const memo = new Map<string, string[]>();

/** One photo's key-less address (one billed call), or null. */
export async function photoUriFor(photoName: string, maxWidthPx: number): Promise<string | null> {
  try {
    const res = await fetch(photoUriRequestUrl(photoName, maxWidthPx, API_KEY));
    return res.ok ? parsePhotoUri(await res.json()) : null;
  } catch {
    return null;
  }
}

/** Up to PHOTO_RAIL_MAX photo addresses for a place's sheet, index-aligned with photoNames ('' = couldn't fetch). */
export async function placePhotoUris(placeId: string, photoNames: string[]): Promise<string[]> {
  if (!placeId || !photoNames.length) return [];
  const hit = memo.get(placeId);
  if (hit) return hit;
  let exists = false;
  try {
    const snap = await getDoc(doc(db, 'places', placeId));
    exists = snap.exists();
    const cached = exists ? freshPhotoUris(snap.data(), Date.now()) : null;
    if (cached) { memo.set(placeId, cached); return cached; }
  } catch { /* fall through to Google */ }
  // Index-aligned with photoNames ('' where a photo failed) so each photo keeps its own credit (final review).
  const uris = (await Promise.all(photoNames.slice(0, PHOTO_RAIL_MAX).map((n) => photoUriFor(n, 600)))).map((u) => u ?? '');
  if (uris.some((u) => u)) {
    memo.set(placeId, uris);
    // Only onto a place someone already cached (a doc with nothing but photos would read as a cached place).
    if (exists) updateDoc(doc(db, 'places', placeId), { photoUris: uris, photoUrisAtMs: Date.now() }).catch(() => {});
  }
  return uris;
}
