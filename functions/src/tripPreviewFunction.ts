import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import {
  cachedCover, canonicalRedirect, coverLookup, previewEligibility, renderTripPreview, tripIdFromPath,
} from './tripPreview';

const db = admin.firestore();

/**
 * The cover's publishable address and its credit, or null. Never the stored
 * Places URL (it holds our key). A Places photo is resolved to its key-less
 * address once a week per trip (`tripPreviewCovers/{tripId}`, server-only),
 * since every lookup is a billed Places Photo call.
 */
async function publishableCover(tripId: string, stored: unknown): Promise<{ url: string; credit: string | null } | null> {
  const source = typeof stored === 'string' ? stored : null;
  const lookup = coverLookup(source);
  if (lookup.kind === 'none' || !source) return null;
  if (lookup.kind === 'direct') return { url: lookup.url, credit: null };

  const cacheRef = db.collection('tripPreviewCovers').doc(tripId);
  const cached = cachedCover((await cacheRef.get()).data(), source, Date.now());
  if (cached) return { url: cached, credit: 'Google' };

  try {
    const r = await fetch(lookup.url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const { photoUri } = (await r.json()) as { photoUri?: unknown };
    if (typeof photoUri !== 'string' || !photoUri.startsWith('https://')) return null;
    await cacheRef.set({ source, photoUri, resolvedAt: Date.now() });
    return { url: photoUri, credit: 'Google' };
  } catch {
    return null;
  }
}

/**
 * Hosting rewrites `/trip/**` here: the page a shared trip link opens when
 * the app isn't installed (with it installed, the universal link opens the
 * app before this is ever asked). Any failure serves the generic page,
 * uncached so a passing error doesn't stick.
 */
export const tripPreview = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  const redirect = canonicalRedirect(req.originalUrl ?? req.url);
  if (redirect) {
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.redirect(301, redirect);
    return;
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  // Browsers recheck after 5 minutes; the CDN keeps a copy for an hour.
  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');

  const tripId = tripIdFromPath(req.path);
  try {
    if (!tripId) {
      res.status(200).send(renderTripPreview(null, []));
      return;
    }
    const tripSnap = await db.collection('trips').doc(tripId).get();
    const trip = tripSnap.data();
    const authorSnap = trip?.authorUid ? await db.collection('users').doc(trip.authorUid).get() : null;
    const author = authorSnap?.data();
    if (!trip || !previewEligibility(trip, author)) {
      res.status(200).send(renderTripPreview(null, [], tripId));
      return;
    }

    const days = await tripSnap.ref.collection('days').orderBy('dayNumber').get();
    const stops: string[] = [];
    for (const day of days.docs) {
      if (stops.length >= 5) break;
      const acts = await day.ref.collection('activities').orderBy('order').limit(5).get();
      for (const a of acts.docs) {
        const t = a.data().title;
        if (typeof t === 'string' && t) stops.push(t);
        if (stops.length >= 5) break;
      }
    }

    const cover = await publishableCover(tripId, trip.coverImageUrl);
    res.status(200).send(renderTripPreview({
      id: tripId,
      title: String(trip.title ?? 'A trip'),
      coverImageUrl: cover?.url ?? null,
      coverCredit: cover?.credit ?? null,
      placeLabel: String(trip.regionName || trip.destination?.name || ''),
      days: days.size,
      authorName: String(author?.fullName ?? author?.displayName ?? 'a traveler'),
    }, stops));
  } catch (err) {
    console.error('tripPreview failed', err);
    res.set('Cache-Control', 'no-store');
    res.status(200).send(renderTripPreview(null, [], tripId));
  }
});
