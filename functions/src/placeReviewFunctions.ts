import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { placeStatsFrom } from './placeReviews';

const db = admin.firestore();
const millis = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0);

/** Whether one of this person's trips (authored or joined) has a stop at this place. */
async function visitedPlace(uid: string, placeId: string): Promise<boolean> {
  const stops = await db.collectionGroup('activities').where('placeId', '==', placeId).limit(300).get();
  const tripIds = [...new Set(stops.docs.map((d) => d.ref.parent.parent?.parent.parent?.id).filter((id): id is string => !!id))];
  if (tripIds.length === 0) return false;
  const trips = await db.getAll(...tripIds.map((id) => db.doc(`trips/${id}`)));
  return trips.some((t) => {
    const x = t.data();
    return !!x && (x.authorUid === uid || (x.collaborators ?? []).includes(uid));
  });
}

/**
 * A review written, edited, hidden or deleted: set its "Visited on a trip"
 * badge (server-only, so it can't be faked) and recompute the place's totals.
 * Writes only when something changed, so its own update doesn't loop.
 */
export const onPlaceReviewWritten = onDocumentWritten('placeReviews/{reviewId}', async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  const placeId = String(after?.placeId ?? before?.placeId ?? '');
  if (!placeId) return;

  if (after) {
    const visited = await visitedPlace(String(after.authorUid), placeId);
    if (after.visited !== visited) {
      await event.data!.after.ref.update({ visited });
      return; // that update triggers this again, which recomputes the totals once
    }
  }

  const reviews = await db.collection('placeReviews').where('placeId', '==', placeId).get();
  const stats = placeStatsFrom(reviews.docs.map((d) => ({
    id: d.id,
    rating: typeof d.data().rating === 'number' ? d.data().rating : null,
    photoUrls: Array.isArray(d.data().photoUrls) ? d.data().photoUrls : [],
    updatedAtMs: millis(d.data().updatedAt),
    moderationHidden: d.data().moderationHidden === true,
  })));
  await db.doc(`placeStats/${placeId}`).set({ ...stats, placeName: String(after?.placeName ?? before?.placeName ?? ''), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
});
