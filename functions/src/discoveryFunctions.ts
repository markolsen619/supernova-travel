import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  destinationKeysFor, sameKeys, isAggregatable, rankTopPlaces, baselinePoints, buildHeatPoints,
  type TaggableDestination, type StopForRanking, type GeoBox,
} from './discovery';

const db = () => admin.firestore();

// The catalog barely changes; one read per warm instance, refreshed every 10 minutes.
let catalogCache: { at: number; entries: (TaggableDestination & { popularity: number })[] } | null = null;
async function loadCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.entries;
  const snap = await db().collection('destinations').get();
  const entries = snap.docs
    .map((d) => ({ slug: d.id, bbox: d.get('bbox') as GeoBox | undefined, popularity: (d.get('popularity') as number) ?? 50 }))
    .filter((d): d is TaggableDestination & { popularity: number } => !!d.bbox);
  catalogCache = { at: Date.now(), entries };
  return entries;
}

/**
 * Tags a public trip with the catalog destinations it visits, so a
 * destination page lists community trips with one array-contains query.
 * Clears the tags when a trip stops being public. Its own write re-triggers
 * it; sameKeys makes that second run a no-op.
 */
export const tagTripDestinations = onDocumentWritten('trips/{tripId}', async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const trip = after.data()!;
  const current = trip.destinationKeys as string[] | undefined;
  // Editorial trips are tagged at seed time with exactly their destination.
  if (trip.isEditorial) return;

  let next: string[] = [];
  if (trip.visibility === 'public') {
    const catalog = await loadCatalog();
    const points = [trip.destination, ...(trip.additionalDestinations ?? [])]
      .map((d: { lat?: number | null; lng?: number | null }) => ({ lat: d?.lat ?? null, lng: d?.lng ?? null }));
    next = destinationKeysFor(points, catalog);
  }
  if (sameKeys(current, next)) return;
  await after.ref.update({ destinationKeys: next });
});

/**
 * Daily: each destination's top places, trip counts, and the globe's heat
 * points. One pass over public tagged trips on the server, instead of every
 * phone reading every trip's activities.
 */
export const aggregateDiscovery = onSchedule({ schedule: 'every day 04:00', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  await runAggregation();
});

export async function runAggregation(): Promise<{ trips: number; points: number }> {
  const catalog = await loadCatalog();
  const tripsSnap = await db().collection('trips').where('visibility', '==', 'public').get();
  const trips = tripsSnap.docs.filter((d) => isAggregatable(d.data()));

  const stopsBySlug = new Map<string, StopForRanking[]>();
  const tripCount = new Map<string, { editorial: number; community: number }>();
  const community: { lat: number; lng: number; saves: number; likes: number }[] = [];

  for (const t of trips) {
    const data = t.data();
    const saves = (data.savesCount as number) ?? 0;
    const likes = (data.likesCount as number) ?? 0;
    const keys = data.destinationKeys as string[];
    for (const k of keys) {
      const c = tripCount.get(k) ?? { editorial: 0, community: 0 };
      if (data.isEditorial) c.editorial += 1; else c.community += 1;
      tripCount.set(k, c);
    }
    const days = await t.ref.collection('days').get();
    for (const day of days.docs) {
      const acts = await day.ref.collection('activities').get();
      for (const a of acts.docs) {
        const act = a.data();
        if (act.lat == null || act.lng == null) continue;
        community.push({ lat: act.lat, lng: act.lng, saves, likes });
        const stop: StopForRanking = {
          placeId: act.placeId ?? null, name: act.placeName || act.title, type: act.type,
          lat: act.lat, lng: act.lng, tripId: t.id, saves,
        };
        for (const k of keys) stopsBySlug.set(k, [...(stopsBySlug.get(k) ?? []), stop]);
      }
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db().batch();
  for (const d of catalog) {
    const counts = tripCount.get(d.slug) ?? { editorial: 0, community: 0 };
    batch.set(db().doc(`destinations/${d.slug}`), {
      topPlaces: rankTopPlaces(stopsBySlug.get(d.slug) ?? []),
      itineraryCount: counts.editorial + counts.community,
      communityTripCount: counts.community,
      aggregatedAt: now,
    }, { merge: true });
  }
  const points = buildHeatPoints(catalog.flatMap((d) => baselinePoints(d)), community);
  // Firestore can't store nested arrays: [lng, lat, weight] triples are flattened.
  batch.set(db().doc('aggregates/heatmap'), { points: points.flat(), stride: 3, updatedAt: now });
  await batch.commit();
  return { trips: trips.length, points: points.length };
}
