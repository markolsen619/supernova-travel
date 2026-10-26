import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { baselinePoints, destinationKeysFor, isEditorialTrip, type GeoBox } from './discovery';
import { editorialUid, loadCatalog } from './discoveryFunctions';
import {
  composeHeat, destinationPoints, heatWrite, pruneTrendDays, sameDestinationPoints, trendDayKey,
  trendNewSlugs, trendPoints, trendTotal, trendWeight, type Triple, endedBeforeCreated,
} from './trending';

const db = () => admin.firestore();

/** Every new or re-destined trip, any visibility, counted per catalog city — anonymously (trendCounts is server-only). */
export const onTripWrittenTrend = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return; // deletions subtract nothing
  if (sameDestinationPoints(before, after)) return; // trips are written constantly
  if (isEditorialTrip(after, editorialUid())) return;
  if (endedBeforeCreated(after)) return; // a past trip someone added isn't where anyone is heading
  const catalog = await loadCatalog();
  const now = destinationKeysFor(destinationPoints(after), catalog);
  if (now.length === 0) return;
  const day = trendDayKey(new Date());
  // trendSeen/{tripId} (server-only): every city this trip was ever counted for — so removing and
  // re-adding a city, or a repeated trigger delivery, never counts it twice.
  const seenRef = db().doc(`trendSeen/${event.params.tripId}`);
  await db().runTransaction(async (tx) => {
    const seen = ((await tx.get(seenRef)).get('counted') ?? []) as string[];
    const added = trendNewSlugs(seen, now);
    if (added.length === 0) return;
    for (const slug of added) {
      tx.set(db().doc(`trendCounts/${slug}`), { days: { [day]: admin.firestore.FieldValue.increment(1) } }, { merge: true });
    }
    tx.set(seenRef, { counted: [...seen, ...added] });
  });
});

/** The trending layer for the catalog right now. */
export async function currentTrendPoints(catalog: { slug: string; bbox: GeoBox }[]): Promise<Triple[]> {
  const snap = await db().collection('trendCounts').get();
  const now = new Date();
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  return snap.docs.flatMap((d) => {
    const dest = bySlug.get(d.id);
    return dest ? trendPoints(dest, trendWeight(trendTotal((d.get('days') ?? {}) as Record<string, number>, now))) : [];
  });
}

function triples(flat: unknown, stride: unknown): Triple[] {
  if (!Array.isArray(flat) || stride !== 3) return [];
  const out: Triple[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]] as Triple);
  return out;
}

/** Rebuilds the globe's heat from baseline + trending + the daily job's community points. */
export async function runTrendRefresh(): Promise<{ cities: number; points: number; wrote: boolean }> {
  const catalog = await loadCatalog();
  const trending = await currentTrendPoints(catalog);
  const communitySnap = await db().doc('serverState/heatCommunity').get();
  const community = triples(communitySnap.get('points'), communitySnap.get('stride'));
  const points = composeHeat(catalog.flatMap((d) => baselinePoints(d)), trending, community).flat();
  const ref = db().doc('aggregates/heatmap');
  const current = (await ref.get()).get('points') as number[] | undefined;
  const wrote = heatWrite({ hasCommunity: communitySnap.exists, current, next: points }) === 'write';
  if (wrote) await ref.set({ points, stride: 3, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  // Keep trendCounts small: drop days outside the window.
  const now = new Date();
  const counts = await db().collection('trendCounts').get();
  await Promise.all(counts.docs.map((d) => {
    const days = (d.get('days') ?? {}) as Record<string, number>;
    const kept = pruneTrendDays(days, now);
    return Object.keys(kept).length === Object.keys(days).length ? null : d.ref.set({ days: kept });
  }));
  return { cities: trending.length / 5, points: points.length / 3, wrote };
}

export const refreshTrending = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 120 }, async () => {
  await runTrendRefresh();
});
