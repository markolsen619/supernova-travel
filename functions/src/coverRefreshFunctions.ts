import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { firstPhotoName, needsRefresh, parsePlacesPhotoUrl, photoUrlFrom } from './coverRefresh';

const db = admin.firestore();
const DAY_MS = 86_400_000;

/** Looks the cover's place up again and saves a fresh photo URL of the same shape; the URL saved, or null. */
async function refreshDoc(ref: FirebaseFirestore.DocumentReference, url: unknown): Promise<string | null> {
  const parsed = parsePlacesPhotoUrl(url);
  if (!parsed) return null;
  const key = process.env.PLACES_API_KEY || parsed.key;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.placeId)}?fields=photos&key=${key}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const name = firstPhotoName(await r.json());
    if (!name) return null;
    // The stored URL's own key, so the app loads it exactly as before.
    const next = photoUrlFrom(name, parsed.key, parsed.maxWidthPx);
    await ref.update({ coverImageUrl: next, coverRefreshedAtMs: Date.now() });
    return next;
  } catch (err) {
    console.warn('cover refresh failed', ref.path, String(err).slice(0, 120));
    return null;
  }
}

/**
 * Daily: every catalog destination and every public trip whose cover photo reference is older than 20 days
 * (Google stops accepting them after a few weeks). Private and followers-only trips refresh on demand
 * (refreshCover) when their owner's or a member's card fails to load.
 */
export const refreshCovers = onSchedule({ schedule: 'every day 05:00', timeZone: 'UTC', timeoutSeconds: 540, memory: '256MiB' }, async () => {
  const now = Date.now();
  const [dests, trips] = await Promise.all([
    db.collection('destinations').select('coverImageUrl', 'coverRefreshedAtMs').get(),
    db.collection('trips').where('visibility', '==', 'public').select('coverImageUrl', 'coverRefreshedAtMs').get(),
  ]);
  const due = [...dests.docs, ...trips.docs]
    .filter((d) => parsePlacesPhotoUrl(d.get('coverImageUrl')) && needsRefresh(d.get('coverRefreshedAtMs'), now))
    .slice(0, 300);
  let ok = 0;
  for (const d of due) if (await refreshDoc(d.ref, d.get('coverImageUrl'))) ok++;
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
  return { url: (await refreshDoc(ref, doc.coverImageUrl)) ?? doc.coverImageUrl ?? null };
});
