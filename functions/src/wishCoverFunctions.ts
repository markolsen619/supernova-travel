/**
 * `wishCovers` — current cover links for the caller's own saved TikTok posts (spec 2026-11-10 §3). Reads TikTok's public
 * embed page server-side (the phone's fetch gets no post) and keeps the link in socialPosts/{id}.cover until TikTok's own
 * x-expires. Only ids in the caller's wish list, so this can't fetch arbitrary TikTok content.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { cleanVideoIds, coverExpiry, coverStillGood } from './wishCovers';
import { embedMeta } from './socialPostFunctions';

const db = () => admin.firestore();

export const wishCovers = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const asked = cleanVideoIds((req.data ?? {}).videoIds);
  if (!asked.length) return { covers: {} };

  const owned = await db().getAll(...asked.map((id) => db().doc(`users/${uid}/wishlist/${id}`)));
  const ids = owned.filter((d) => d.exists).map((d) => d.id);
  const now = Date.now();

  const results = await Promise.allSettled(ids.map(async (id): Promise<[string, string | null]> => {
    const ref = db().doc(`socialPosts/${id}`);
    const snap = await ref.get();
    const cached = snap.get('cover');
    if (coverStillGood(cached, now)) return [id, cached.url];
    const url = (await embedMeta(id))?.coverUrl ?? null;
    // Its own field, merged into an existing cache entry only: never creates the doc, never touches its places.
    if (url && snap.exists) await ref.update({ cover: { url, expiresMs: coverExpiry(url, now) } }).catch(() => {});
    return [id, url];
  }));

  const covers: Record<string, string | null> = {};
  for (const r of results) if (r.status === 'fulfilled') covers[r.value[0]] = r.value[1];
  const missing = ids.filter((id) => !covers[id]).length;
  if (missing) console.warn('wishCovers', { asked: asked.length, owned: ids.length, missing });
  return { covers };
});
