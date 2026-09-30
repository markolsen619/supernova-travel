import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  destinationKeysFor, sameKeys, isAggregatable, rankTopPlaces, baselinePoints, buildHeatPoints,
  isEditorialTrip, stopDestinationKeys,
  type TaggableDestination, type StopForRanking, type GeoBox,
} from './discovery';

const db = () => admin.firestore();
/** functions/.env. Only this account's trips count as editorial (isEditorialTrip). */
const editorialUid = () => process.env.EDITORIAL_UID ?? '';

/** The tags a trip should carry: its destinations' catalog boxes, only while public. */
function wantedKeys(trip: admin.firestore.DocumentData, catalog: TaggableDestination[]): string[] {
  if (trip.visibility !== 'public') return [];
  const points = [trip.destination, ...(trip.additionalDestinations ?? [])]
    .map((d: { lat?: number | null; lng?: number | null }) => ({ lat: d?.lat ?? null, lng: d?.lng ?? null }));
  return destinationKeysFor(points, catalog);
}

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
  // Editorial trips are tagged at seed time with exactly their destination.
  if (isEditorialTrip(trip, editorialUid())) return;
  // Not public: no tags — and no catalog read in the common case.
  const next = trip.visibility === 'public' ? wantedKeys(trip, await loadCatalog()) : [];
  if (sameKeys(trip.destinationKeys as string[] | undefined, next)) return;
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

export async function runAggregation(): Promise<{ trips: number; points: number; retagged: number }> {
  const catalog = await loadCatalog();
  const ed = editorialUid();
  const tripsSnap = await db().collection('trips').where('visibility', '==', 'public').get();

  // Backfill: tag public trips the trigger never saw (created before it was
  // deployed, or before their destination was seeded). Same rule as the trigger.
  let retagged = 0;
  const trips: { id: string; data: admin.firestore.DocumentData; ref: admin.firestore.DocumentReference }[] = [];
  for (const d of tripsSnap.docs) {
    const data = d.data();
    if (!isEditorialTrip(data, ed)) {
      const next = wantedKeys(data, catalog);
      if (!sameKeys(data.destinationKeys as string[] | undefined, next)) {
        await d.ref.update({ destinationKeys: next });
        data.destinationKeys = next;
        retagged += 1;
      }
    }
    if (isAggregatable(data)) trips.push({ id: d.id, data, ref: d.ref });
  }

  const stopsBySlug = new Map<string, StopForRanking[]>();
  const tripCount = new Map<string, { editorial: number; community: number }>();
  const community: { lat: number; lng: number; saves: number; likes: number }[] = [];

  // Trips in parallel, a few at a time; each trip's days in parallel too.
  const CONCURRENCY = 8;
  for (let i = 0; i < trips.length; i += CONCURRENCY) {
    await Promise.all(trips.slice(i, i + CONCURRENCY).map(async (t) => {
      const saves = (t.data.savesCount as number) ?? 0;
      const likes = (t.data.likesCount as number) ?? 0;
      const keys = t.data.destinationKeys as string[];
      const editorial = isEditorialTrip(t.data, ed);
      for (const k of keys) {
        const c = tripCount.get(k) ?? { editorial: 0, community: 0 };
        if (editorial) c.editorial += 1; else c.community += 1;
        tripCount.set(k, c);
      }
      const days = await t.ref.collection('days').get();
      const activitySnaps = await Promise.all(days.docs.map((day) => day.ref.collection('activities').get()));
      for (const acts of activitySnaps) {
        for (const a of acts.docs) {
          const act = a.data();
          if (act.lat == null || act.lng == null) continue;
          community.push({ lat: act.lat, lng: act.lng, saves, likes });
          const stop: StopForRanking = {
            placeId: act.placeId ?? null, name: act.placeName || act.title, type: act.type,
            lat: act.lat, lng: act.lng, tripId: t.id, saves,
          };
          // Only the destination this stop is actually in (a multi-city trip
          // must not put Porto restaurants on Lisbon's page).
          for (const k of stopDestinationKeys(stop, keys, catalog)) {
            const list = stopsBySlug.get(k);
            if (list) list.push(stop); else stopsBySlug.set(k, [stop]);
          }
        }
      }
    }));
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
  return { trips: trips.length, points: points.length, retagged };
}
