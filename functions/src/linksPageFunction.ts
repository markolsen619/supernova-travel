import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { parseLinksConfig, renderLinksPage, type LinksTrip } from './linksPage';
import { platformFromUserAgent } from './tripInviteLinks';

const db = admin.firestore();
const PHOTO_MAX_AGE_MS = 7 * 86_400_000;

/** Shown until appConfig/links lists trips: six Supernova itineraries (2026-11-01). */
const DEFAULT_TRIPS = [
  { tripId: 'QF0jb64PX4JaK1038n9R', city: 'Lisbon', query: 'Alfama Lisbon viewpoint' },
  { tripId: 'A4Lf65D8fCv0cx8Ujcx5', city: 'Tokyo', query: 'Shibuya Crossing Tokyo' },
  { tripId: 'SRpjT6r8LMP6xLQD0BVZ', city: 'Paris', query: 'Eiffel Tower Paris' },
  { tripId: '0lCuCv7eKo1KiMkWNUP3', city: 'Rome', query: 'Colosseum Rome' },
  { tripId: '5Vdnlbar1XYMz54gVs7e', city: 'Kyoto', query: 'Fushimi Inari Kyoto' },
  { tripId: '5YZ2ZKA155wGl4tvLype', city: 'Mexico City', query: 'Palacio de Bellas Artes Mexico City' },
];

/**
 * A fresh, key-less photo for a featured trip, refreshed weekly (`linksPhotos/{tripId}`, server-only). Google's
 * photo references expire — the catalog's stored covers already have — so the page looks the place up again
 * instead of trusting a saved one. One Places text search per trip per week.
 */
async function tripPhoto(tripId: string, query: string): Promise<string | null> {
  const ref = db.collection('linksPhotos').doc(tripId);
  const cached = (await ref.get()).data();
  if (cached?.photoUri && cached.query === query && Date.now() - (cached.resolvedAt ?? 0) < PHOTO_MAX_AGE_MS) return cached.photoUri;
  const key = process.env.PLACES_API_KEY;
  if (!key) return cached?.photoUri ?? null;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.photos' },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(4000),
    });
    const name = ((await r.json()) as { places?: { photos?: { name?: string }[] }[] }).places?.[0]?.photos?.[0]?.name;
    if (!name) return cached?.photoUri ?? null;
    const m = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=400&skipHttpRedirect=true&key=${key}`, { signal: AbortSignal.timeout(4000) });
    const { photoUri } = (await m.json()) as { photoUri?: unknown };
    if (typeof photoUri !== 'string' || !photoUri.startsWith('https://')) return cached?.photoUri ?? null;
    await ref.set({ photoUri, query, resolvedAt: Date.now() });
    return photoUri;
  } catch {
    return cached?.photoUri ?? null;
  }
}

/** Hosting `/` and `/links` (and the supernovatravel.xyz domain's root): the bio link page. */
export const linksPage = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  const platform = platformFromUserAgent(req.get('user-agent'));
  try {
    const config = parseLinksConfig((await db.doc('appConfig/links').get()).data());
    const wanted = config.trips.length ? config.trips : DEFAULT_TRIPS;
    const trips = (await Promise.all(wanted.map(async (w): Promise<LinksTrip | null> => {
      const snap = await db.doc(`trips/${w.tripId}`).get();
      const t = snap.data();
      // Only public trips: the page is for anyone.
      if (!t || t.visibility !== 'public' || t.moderationHidden === true) return null;
      const [days, photo] = await Promise.all([
        snap.ref.collection('days').count().get().then((c) => c.data().count).catch(() => null),
        tripPhoto(w.tripId, w.query),
      ]);
      return { id: w.tripId, city: w.city, days, title: String(t.title ?? w.city), photoUrl: photo, credit: photo ? 'Google' : null };
    }))).filter((t): t is LinksTrip => !!t);
    res.status(200).send(renderLinksPage({ promo: config.promo, trips, platform }));
  } catch (err) {
    console.error('linksPage failed', err);
    res.set('Cache-Control', 'no-store');
    res.status(200).send(renderLinksPage({ promo: null, trips: [], platform }));
  }
});
