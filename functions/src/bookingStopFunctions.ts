import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  bookingDayNumber, bookingStopAllowed, bookingStopId, existingStopFor, stopFromBooking, tripStartDay, type BookingKind,
} from './bookingStops';
import { shareTarget, sharedTripId, tripMembers } from './sharedBookings';

const db = admin.firestore();

/** A stop deleted by a member: never recreated while the booking stays on the trip (the app writes these). */
const dismissedRef = (tripId: string, kind: BookingKind, id: string) => db.doc(`trips/${tripId}/dismissedBookingStops/${kind}_${id}`);

interface Carrier { ref: DocumentReference; dayId: string; auto: boolean }

/** Every stop on the trip carrying this booking — found by its link, wherever it has been moved. */
async function carriersOf(kind: BookingKind, id: string, days: QueryDocumentSnapshot[]): Promise<Carrier[]> {
  const out: Carrier[] = [];
  for (const day of days) {
    const linked = await day.ref.collection('activities').where('fromBooking.id', '==', id).get();
    for (const s of linked.docs) {
      if (s.data().fromBooking?.kind !== kind) continue;
      out.push({ ref: s.ref, dayId: day.id, auto: !!s.data().fromBooking?.auto });
    }
  }
  return out;
}

/** Take this booking's stop off a trip: delete the one it made, and unhook a planned stop it attached to. */
async function removeBookingStop(tripId: string, kind: BookingKind, id: string, opts: { forgetDismissal: boolean }) {
  const days = (await db.collection(`trips/${tripId}/days`).get()).docs;
  const carriers = await carriersOf(kind, id, days);
  const batch = db.batch();
  for (const c of carriers) {
    if (c.auto) batch.delete(c.ref);
    else batch.update(c.ref, { fromBooking: admin.firestore.FieldValue.delete() });
  }
  // Unlinked from the trip: linking it again later brings its stop back.
  if (opts.forgetDismissal) batch.delete(dismissedRef(tripId, kind, id));
  await batch.commit();
}

/**
 * Keeps a booking's stop in step with it (bookingStops.ts): on the trip day it
 * falls on, while it's shared with a trip its owner is on and the trip's
 * visibility allows it. Runs from the booking triggers, when a trip's dates /
 * cities / visibility change, and when days are added.
 */
export async function syncBookingStop(kind: BookingKind, id: string, before: Record<string, any> | undefined, after: Record<string, any> | undefined) {
  const oldTrip = sharedTripId(before);
  const newTrip = shareTarget(before, after);
  if (oldTrip && oldTrip !== newTrip) await removeBookingStop(oldTrip, kind, id, { forgetDismissal: true });
  if (!newTrip || !after) return;

  const trip = (await db.doc(`trips/${newTrip}`).get()).data();
  if (!trip || !tripMembers(trip).has(after.ownerUid)) {
    await removeBookingStop(newTrip, kind, id, { forgetDismissal: true });
    return;
  }
  if (!bookingStopAllowed(kind, after, trip.visibility)) {
    // e.g. a hotel on a public trip: members-only, so no stop (a dismissal still stands).
    await removeBookingStop(newTrip, kind, id, { forgetDismissal: false });
    return;
  }

  const days = (await db.collection(`trips/${newTrip}/days`).get()).docs;
  const lastDay = days.reduce((m, d) => Math.max(m, Number(d.data().dayNumber) || 0), 0);
  const n = bookingDayNumber(kind, after, tripStartDay(trip), lastDay);
  const day = n ? days.find((d) => d.data().dayNumber === n) : undefined;
  const carriers = await carriersOf(kind, id, days);
  const autos = carriers.filter((c) => c.auto);

  if (!day) {
    // Outside the trip's days (or no days yet): no stop of its own.
    if (autos.length) { const b = db.batch(); autos.forEach((c) => b.delete(c.ref)); await b.commit(); }
    return;
  }
  // A planned stop carries it, or its own stop is already on the right day: just drop any stray copies.
  if (carriers.some((c) => !c.auto) || autos.some((c) => c.dayId === day.id)) {
    const strays = autos.filter((c) => c.dayId !== day.id);
    if (strays.length) { const b = db.batch(); strays.forEach((c) => b.delete(c.ref)); await b.commit(); }
    return;
  }
  // Its stop is on another day (the booking's date or the trip's days moved): it follows the booking.
  const moving = autos[0];
  const movingData = moving ? (await moving.ref.get()).data() : undefined;
  if (!moving && (await dismissedRef(newTrip, kind, id).get()).exists) return; // deleted by a member: stays gone

  const activities = (await day.ref.collection('activities').get()).docs;
  const lastOrder = activities.reduce((m, a) => Math.max(m, Number(a.data().order) || 0), 0);
  const batch = db.batch();
  autos.forEach((c) => batch.delete(c.ref));
  const stopRef = day.ref.collection('activities').doc(bookingStopId(kind, id));
  if (movingData) {
    batch.set(stopRef, { ...movingData, order: lastOrder + 1000 });
  } else {
    const plannedId = existingStopFor(kind, after, activities.map((a) => ({ id: a.id, ...(a.data() as { type: string; title: string; placeName?: string | null }) })));
    if (plannedId) {
      batch.update(day.ref.collection('activities').doc(plannedId), {
        fromBooking: { kind, id, ownerUid: String(after.ownerUid ?? ''), auto: false },
      });
    } else {
      const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
      const city = cities[day.data().destinationIndex ?? 0]?.name ?? trip.destination?.name ?? null;
      batch.set(stopRef, {
        ...stopFromBooking(kind, id, after, city),
        order: lastOrder + 1000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

/** Re-sync every booking linked to a trip (its dates, cities, visibility or days changed). */
export async function resyncTripBookingStops(tripId: string) {
  for (const [kind, col] of [['boarding_pass', 'boarding_passes'], ['reservation', 'reservations']] as const) {
    const linked = await db.collection(col).where('tripId', '==', tripId).get();
    for (const d of linked.docs) {
      try {
        await syncBookingStop(kind, d.id, d.data(), d.data());
      } catch (err) {
        console.error('[bookingStop] resync failed', kind, d.id, err);
      }
    }
  }
}

/**
 * A day added to a trip (Add day, a route save, Edit trip dates) may be the day a
 * linked booking falls on — the trip-doc trigger can run before the days exist.
 */
export const onTripDayCreatedBookingStops = onDocumentCreated('trips/{tripId}/days/{dayId}', (event) =>
  resyncTripBookingStops(event.params.tripId));
