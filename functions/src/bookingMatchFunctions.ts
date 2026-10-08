import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  linkPatchFor, matchDecision, rematchable, toMatchableTrip, tripMatchInputsChanged,
  type MatchableBooking, type MatchableTrip,
} from './bookingMatch';
import { syncTripShares } from './sharedBookingFunctions';

const db = admin.firestore();
const COLLECTIONS = { boarding_pass: 'boarding_passes', reservation: 'reservations' } as const;
type Kind = keyof typeof COLLECTIONS;

async function isPaid(uid: string): Promise<boolean> {
  const tier = (await db.doc(`users/${uid}`).get()).data()?.tier;
  return tier === 'pro' || tier === 'business';
}

/** Trips a user can attach bookings to: their own and ones they're on. */
async function tripsFor(uid: string): Promise<MatchableTrip[]> {
  const [own, shared] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const byId = new Map<string, MatchableTrip>();
  for (const d of [...own.docs, ...shared.docs]) byId.set(d.id, toMatchableTrip(d.id, d.data()));
  return [...byId.values()];
}

const summary = (t: MatchableTrip) => ({ tripId: t.id, title: t.title, start: t.start, end: t.end });

/** Called by the app right after a booking is saved; Part 2's email import calls `matchOne`. */
export async function matchOne(uid: string, kind: Kind, id: string) {
  const ref = db.collection(COLLECTIONS[kind]).doc(id);
  const snap = await ref.get();
  const item = snap.data();
  if (!item || item.ownerUid !== uid) throw new HttpsError('not-found', 'Booking not found');
  if (!(await isPaid(uid))) return { kind: 'none' as const };
  const booking = { ...item, kind } as MatchableBooking;
  if (booking.tripLinkDismissed || booking.tripLink === 'manual') return { kind: 'none' as const };
  const trips = await tripsFor(uid);
  const decision = matchDecision(booking, trips);
  const patch = linkPatchFor(booking, decision);
  if (patch) await ref.update(patch);
  const byId = new Map(trips.map((t) => [t.id, t]));
  if (decision.kind === 'link') return { kind: 'link' as const, trip: summary(byId.get(decision.tripId)!) };
  if (decision.kind === 'ask') return { kind: 'ask' as const, trips: decision.tripIds.map((t) => summary(byId.get(t)!)) };
  return { kind: 'none' as const };
}

export const matchBooking = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const { kind, id } = (request.data ?? {}) as { kind?: unknown; id?: unknown };
  if ((kind !== 'boarding_pass' && kind !== 'reservation') || typeof id !== 'string' || !id) {
    throw new HttpsError('invalid-argument', 'kind and id are required');
  }
  return matchOne(request.auth.uid, kind, id);
});

/**
 * A trip created, re-dated, re-placed, re-membered or deleted can change which
 * bookings belong to it. Everything else (likes, covers, titles) returns at
 * once — trips are written often. Writes bookings only, so it can't loop.
 */
export const onTripWrittenRematch = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!tripMatchInputsChanged(before, after)) return;
  const tripId = event.params.tripId;

  if (!after) {
    for (const col of Object.values(COLLECTIONS)) {
      const linked = await db.collection(col).where('tripId', '==', tripId).get();
      const batch = db.batch();
      linked.docs.forEach((d) => batch.update(d.ref, { tripId: null, tripLink: null }));
      if (!linked.empty) await batch.commit();
    }
    await syncTripShares(tripId, undefined);
    return;
  }

  const members = new Set<string>([after.authorUid, ...((after.collaborators ?? []) as string[])].filter(Boolean));
  for (const uid of members) {
    if (!(await isPaid(uid))) continue;
    const trips = await tripsFor(uid);
    for (const [kind, col] of Object.entries(COLLECTIONS) as [Kind, string][]) {
      const items = await db.collection(col).where('ownerUid', '==', uid).get();
      const batch = db.batch();
      let writes = 0;
      for (const d of items.docs) {
        const booking = { ...d.data(), kind } as MatchableBooking;
        if (!rematchable(booking, tripId)) continue;
        const patch = linkPatchFor(booking, matchDecision(booking, trips), tripId);
        if (patch) { batch.update(d.ref, patch); writes++; }
      }
      if (writes) await batch.commit();
    }
  }
  // Who the trip's bookings are shared with follows who is on it.
  if (JSON.stringify(before?.collaborators ?? []) !== JSON.stringify(after.collaborators ?? [])) {
    await syncTripShares(tripId, after);
  }
});
