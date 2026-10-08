import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { mirrorId, mirrorPlan, shareTarget, sharedCopy, sharedTripId, tripMembers, type BookingKind } from './sharedBookings';

const db = admin.firestore();
const COLLECTIONS: Record<BookingKind, string> = { boarding_pass: 'boarding_passes', reservation: 'reservations' };

async function ownerName(uid: string): Promise<string> {
  const u = (await db.doc(`users/${uid}`).get()).data();
  return String(u?.displayName || u?.fullName || u?.username || 'A traveler');
}

/** Keep one booking's shared copy in step with it (see sharedBookings.ts). */
async function syncBooking(kind: BookingKind, id: string, before: Record<string, any> | undefined, after: Record<string, any> | undefined) {
  const docId = mirrorId(kind, id);
  const oldTrip = sharedTripId(before);
  const newTrip = shareTarget(before, after);
  if (oldTrip && oldTrip !== newTrip) await db.doc(`trips/${oldTrip}/bookings/${docId}`).delete();
  if (!newTrip || !after) return;
  // Flight-status polling rewrites passes every 30 min; skip when nothing members see changed.
  if (oldTrip === newTrip && before
    && JSON.stringify(sharedCopy(kind, id, before, '')) === JSON.stringify(sharedCopy(kind, id, after, ''))) return;

  const ref = db.doc(`trips/${newTrip}/bookings/${docId}`);
  const trip = (await db.doc(`trips/${newTrip}`).get()).data();
  if (!tripMembers(trip).has(after.ownerUid)) {
    await ref.delete();
    return;
  }
  await ref.set(sharedCopy(kind, id, after, await ownerName(after.ownerUid)));
}

export const onBoardingPassWrittenShare = onDocumentWritten('boarding_passes/{id}', (event) =>
  syncBooking('boarding_pass', event.params.id, event.data?.before?.data(), event.data?.after?.data()));

export const onReservationWrittenShare = onDocumentWritten('reservations/{id}', (event) =>
  syncBooking('reservation', event.params.id, event.data?.before?.data(), event.data?.after?.data()));

/**
 * Rebuild a trip's shared copies from its linked bookings — when its members
 * change (someone who left stops sharing; someone re-added starts again) or
 * it is deleted (`trip` undefined: every copy goes, since deleting a document
 * leaves its subcollections behind). Also used by the backfill script.
 */
export async function syncTripShares(tripId: string, trip: Record<string, any> | undefined) {
  const members = tripMembers(trip);
  const linked: { kind: BookingKind; id: string; data: Record<string, any> }[] = [];
  if (trip) {
    for (const kind of Object.keys(COLLECTIONS) as BookingKind[]) {
      const snap = await db.collection(COLLECTIONS[kind]).where('tripId', '==', tripId).get();
      snap.docs.forEach((d) => linked.push({ kind, id: d.id, data: d.data() }));
    }
  }
  const existing = (await db.collection(`trips/${tripId}/bookings`).get()).docs.map((d) => d.id);
  const plan = mirrorPlan(
    linked.map((b) => ({ id: mirrorId(b.kind, b.id), ownerUid: b.data.ownerUid, shared: sharedTripId(b.data) === tripId })),
    existing,
    members,
  );
  const names = new Map<string, string>();
  const batch = db.batch();
  for (const b of linked) {
    const docId = mirrorId(b.kind, b.id);
    if (!plan.write.includes(docId)) continue;
    if (!names.has(b.data.ownerUid)) names.set(b.data.ownerUid, await ownerName(b.data.ownerUid));
    batch.set(db.doc(`trips/${tripId}/bookings/${docId}`), sharedCopy(b.kind, b.id, b.data, names.get(b.data.ownerUid)!));
  }
  plan.remove.forEach((docId) => batch.delete(db.doc(`trips/${tripId}/bookings/${docId}`)));
  if (plan.write.length || plan.remove.length) await batch.commit();
}
