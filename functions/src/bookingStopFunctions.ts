import * as admin from 'firebase-admin';
import { bookingDayNumber, bookingStopId, existingStopFor, stopFromBooking, tripCalendarDay, type BookingKind } from './bookingStops';
import { shareTarget, sharedTripId, tripMembers } from './sharedBookings';

const db = admin.firestore();

/** Take this booking's stop off a trip: delete the one it made, and unhook a planned stop it attached to. */
async function removeBookingStop(tripId: string, kind: BookingKind, id: string) {
  const days = (await db.collection(`trips/${tripId}/days`).get()).docs;
  const batch = db.batch();
  let writes = 0;
  for (const day of days) {
    const linked = await day.ref.collection('activities').where('fromBooking.id', '==', id).get();
    for (const s of linked.docs) {
      if (s.data().fromBooking?.kind !== kind) continue;
      if (s.data().fromBooking?.auto) batch.delete(s.ref);
      else batch.update(s.ref, { fromBooking: admin.firestore.FieldValue.delete() });
      writes++;
    }
  }
  if (writes) await batch.commit();
}

/**
 * Keeps a booking's stop in step with it (bookingStops.ts): on the trip day it
 * falls on, for as long as it is shared with a trip its owner is on. Runs from
 * the same booking triggers as the shared copies (sharedBookingFunctions.ts).
 */
export async function syncBookingStop(kind: BookingKind, id: string, before: Record<string, any> | undefined, after: Record<string, any> | undefined) {
  const oldTrip = sharedTripId(before);
  const newTrip = shareTarget(before, after);
  if (oldTrip && oldTrip !== newTrip) await removeBookingStop(oldTrip, kind, id);
  if (!newTrip || !after) return;

  const tripSnap = await db.doc(`trips/${newTrip}`).get();
  const trip = tripSnap.data();
  if (!trip || !tripMembers(trip).has(after.ownerUid)) {
    await removeBookingStop(newTrip, kind, id);
    return;
  }
  const start = trip.startDate?.toMillis ? tripCalendarDay(trip.startDate.toMillis()) : null;
  const days = (await db.collection(`trips/${newTrip}/days`).get()).docs;
  const n = bookingDayNumber(kind, after, start, days.length);
  const day = n ? days.find((d) => d.data().dayNumber === n) : undefined;

  // Where this booking's stop is now, if anywhere.
  const stopId = bookingStopId(kind, id);
  const autoRefs = days.map((d) => d.ref.collection('activities').doc(stopId));
  const autos = autoRefs.length ? await db.getAll(...autoRefs) : [];
  const autoIn = autos.filter((s) => s.exists);

  if (!day) {
    // Outside the trip's days (or the trip has none yet): no stop.
    await removeBookingStop(newTrip, kind, id);
    return;
  }
  if (autoIn.some((s) => s.ref.parent.parent?.id === day.id)) {
    // Already there; keep its confirmation code current. Everything else is the traveller's to edit.
    const here = autoIn.find((s) => s.ref.parent.parent?.id === day.id)!;
    const code = typeof after.confirmationCode === 'string' && after.confirmationCode ? after.confirmationCode : null;
    if (here.data()?.bookingRef !== code) await here.ref.update({ bookingRef: code });
    return;
  }
  // Moved to another day: its old stop goes, a fresh one is made below.
  if (autoIn.length) {
    const batch = db.batch();
    autoIn.forEach((s) => batch.delete(s.ref));
    await batch.commit();
  }

  const activities = (await day.ref.collection('activities').get()).docs;
  if (activities.some((a) => a.data().fromBooking?.id === id && a.data().fromBooking?.kind === kind)) return; // a planned stop already carries it
  const plannedId = existingStopFor(kind, after, activities.map((a) => ({ id: a.id, ...(a.data() as { type: string; title: string; placeName?: string | null }) })));
  if (plannedId) {
    await day.ref.collection('activities').doc(plannedId).update({
      fromBooking: { kind, id, ownerUid: String(after.ownerUid ?? ''), auto: false },
    });
    return;
  }
  const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
  const city = cities[day.data().destinationIndex ?? 0]?.name ?? trip.destination?.name ?? null;
  const lastOrder = activities.reduce((m, a) => Math.max(m, Number(a.data().order) || 0), 0);
  await day.ref.collection('activities').doc(stopId).set({
    ...stopFromBooking(kind, id, after, city),
    order: lastOrder + 1000,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
