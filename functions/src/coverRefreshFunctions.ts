import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { coverDue, coverPlaceId, firstPhotoName, parsePlacesPhotoUrl, photoUriFrom, photoUriRequest } from './coverRefresh';

const db = admin.firestore();
const DAY_MS = 86_400_000;

/**
 * Looks the cover's place up again and saves Google's key-less photo address for it (free to view), with the place
 * id to refresh it by next time; the address saved, or null. Two billed calls: the place's photos, then the address.
 */
async function refreshDoc(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): Promise<string | null> {
  const placeId = coverPlaceId(data);
  const key = process.env.PLACES_API_KEY || parsePlacesPhotoUrl(data.coverImageUrl)?.key;
  if (!placeId || !key) return null;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=photos&key=${key}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const name = firstPhotoName(await r.json());
    if (!name) return null;
    const m = await fetch(photoUriRequest(name, key, parsePlacesPhotoUrl(data.coverImageUrl)?.maxWidthPx ?? 1200), { signal: AbortSignal.timeout(5000) });
    if (!m.ok) return null;
    const uri = photoUriFrom(await m.json());
    if (!uri) return null;
    await ref.update({ coverImageUrl: uri, coverPlaceId: placeId, coverRefreshedAtMs: Date.now() });
    return uri;
  } catch (err) {
    console.warn('cover refresh failed', ref.path, String(err).slice(0, 120));
    return null;
  }
}

/**
 * Daily: every catalog destination and public trip whose cover is due (`coverDue`: a keyed URL, or a photo address
 * older than 10 days), and every trip still holding a keyed URL. Private and followers-only trips refresh on demand
 * (refreshCover) when their owner's or a member's card fails to load.
 */
export const refreshCovers = onSchedule({ schedule: 'every day 05:00', timeZone: 'UTC', timeoutSeconds: 540, memory: '256MiB' }, async () => {
  const now = Date.now();
  const fields = ['coverImageUrl', 'coverPlaceId', 'coverRefreshedAtMs', 'visibility'];
  const [dests, trips] = await Promise.all([
    db.collection('destinations').select(...fields).get(),
    db.collection('trips').select(...fields).get(),
  ]);
  // Destinations and public trips stay fresh on schedule. Any trip still holding a keyed URL is converted once,
  // whatever its visibility (older apps keep drawing it, billed). Private photo addresses refresh on demand.
  const due = [...dests.docs, ...trips.docs]
    .filter((d) => (d.ref.parent.id === 'destinations' || d.get('visibility') === 'public' || parsePlacesPhotoUrl(d.get('coverImageUrl')))
      && coverDue(d.data(), now))
    .slice(0, 300);
  let ok = 0;
  for (const d of due) if (await refreshDoc(d.ref, d.data())) ok++;
  console.log('refreshCovers', { due: due.length, refreshed: ok });
});

/**
 * A card whose cover failed to load asks for that one cover (once a day per cover). Anyone signed in may ask
 * for a destination or a trip they can see: public, or one they're on.
 */
export const refreshCover = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const { kind, id } = (req.data ?? {}) as { kind?: unknown; id?: unknown };
  if ((kind !== 'trip' && kind !== 'destination') || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'kind and id are required');
  }
  const ref = db.doc(`${kind === 'trip' ? 'trips' : 'destinations'}/${id}`);
  const doc = (await ref.get()).data();
  if (!doc) throw new HttpsError('not-found', 'Not found');
  if (kind === 'trip') {
    const member = doc.authorUid === uid || (doc.collaborators ?? []).includes(uid);
    const follower = doc.visibility === 'followers' && (await db.doc(`follows/${uid}_${doc.authorUid}`).get()).exists;
    if (!(doc.visibility === 'public' || member || follower) || doc.moderationHidden === true) throw new HttpsError('permission-denied', 'Not found');
  }
  const refreshedAt = doc.coverRefreshedAtMs as number | undefined;
  if (typeof refreshedAt === 'number' && Date.now() - refreshedAt < DAY_MS) return { url: doc.coverImageUrl ?? null };
  return { url: (await refreshDoc(ref, doc)) ?? doc.coverImageUrl ?? null };
});
