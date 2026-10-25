import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { itineraryFlagChange } from './tripItinerary';

const db = admin.firestore();

/**
 * Keeps each trip's stop count (server-only `tripStats/{tripId}`) and flips `trips/{id}.hasItinerary` when it crosses
 * 3 stops (tripItinerary.ts). Only creates and deletes move the count; edits don't. Backfill:
 * `node scripts/backfill-trip-itinerary.mjs [--dry-run]`.
 */
export const onTripActivityWrittenCount = onDocumentWritten(
  { document: 'trips/{tripId}/days/{dayId}/activities/{activityId}', region: 'us-central1' },
  async (event) => {
    const existed = !!event.data?.before.exists;
    const exists = !!event.data?.after.exists;
    if (existed === exists) return;
    const delta = exists ? 1 : -1;
    const tripRef = db.doc(`trips/${event.params.tripId}`);
    const statsRef = db.doc(`tripStats/${event.params.tripId}`);
    await db.runTransaction(async (tx) => {
      const [stats, trip] = await Promise.all([tx.get(statsRef), tx.get(tripRef)]);
      const before = Number(stats.get('stopCount') ?? 0);
      const after = Math.max(0, before + delta);
      tx.set(statsRef, { stopCount: after }, { merge: true });
      const flag = itineraryFlagChange(before, after);
      if (flag !== null && trip.exists) tx.update(tripRef, { hasItinerary: flag });
    });
  },
);
