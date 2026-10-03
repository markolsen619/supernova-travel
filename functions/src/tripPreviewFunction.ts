import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { coverLookup, previewEligibility, renderTripPreview, tripIdFromPath } from './tripPreview';

const db = admin.firestore();

/** The cover's publishable address, or null. Never the stored Places URL (it holds our key). */
async function publishableCover(stored: unknown): Promise<string | null> {
  const lookup = coverLookup(typeof stored === 'string' ? stored : null);
  if (lookup.kind === 'none') return null;
  if (lookup.kind === 'direct') return lookup.url;
  try {
    const r = await fetch(lookup.url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const { photoUri } = (await r.json()) as { photoUri?: unknown };
    return typeof photoUri === 'string' && photoUri.startsWith('https://') ? photoUri : null;
  } catch {
    return null;
  }
}

/**
 * Hosting rewrites `/trip/**` here: the page a shared trip link opens when
 * the app isn't installed (with it installed, the universal link opens the
 * app before this is ever asked). Any failure serves the generic page.
 */
export const tripPreview = onRequest({ region: 'us-central1', memory: '256MiB' }, async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'text/html; charset=utf-8');
  try {
    const tripId = tripIdFromPath(req.path);
    if (!tripId) {
      res.status(200).send(renderTripPreview(null, []));
      return;
    }
    const tripSnap = await db.collection('trips').doc(tripId).get();
    const trip = tripSnap.data();
    const authorSnap = trip?.authorUid ? await db.collection('users').doc(trip.authorUid).get() : null;
    const author = authorSnap?.data();
    if (!trip || !previewEligibility(trip, author)) {
      res.status(200).send(renderTripPreview(null, []));
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

    res.status(200).send(renderTripPreview({
      id: tripId,
      title: String(trip.title ?? 'A trip'),
      coverImageUrl: await publishableCover(trip.coverImageUrl),
      placeLabel: String(trip.regionName || trip.destination?.name || ''),
      days: days.size,
      authorName: String(author?.fullName ?? author?.displayName ?? 'a traveler'),
    }, stops));
  } catch (err) {
    console.error('tripPreview failed', err);
    res.status(200).send(renderTripPreview(null, []));
  }
});
