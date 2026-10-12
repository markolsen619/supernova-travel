import * as admin from 'firebase-admin';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  calendarDay, dayDateMs, isTripUnderwayToday, pickTodayTrip, shouldSeeTraveler, todayKey, todaysCity, travelInputsChanged,
  type DayLike, type TripLike,
} from './friendsTraveling';

/**
 * Friends on a trip, on the globe (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md).
 * Each viewer has a server-written list users/{V}/friendsTraveling/{T}; syncTraveler(T) makes every
 * list agree with T's trips today. Pure decisions in friendsTraveling.ts.
 */
const db = () => admin.firestore();
const TWO_DAYS = 2 * 86_400_000;

const ms = (v: unknown): number | null =>
  v && typeof (v as admin.firestore.Timestamp).toMillis === 'function' ? (v as admin.firestore.Timestamp).toMillis() : null;

function tripLike(d: admin.firestore.DocumentData | undefined | null): TripLike | null {
  if (!d) return null;
  return {
    visibility: d.visibility, moderationHidden: d.moderationHidden === true,
    startDateMs: ms(d.startDate), endDateMs: ms(d.endDate),
    destination: d.destination ?? null, additionalDestinations: d.additionalDestinations ?? null,
    collaborators: Array.isArray(d.collaborators) ? d.collaborators : [], authorUid: d.authorUid,
  };
}

async function deleteEntriesFor(uid: string, keep: Set<string> = new Set()): Promise<void> {
  const snap = await db().collectionGroup('friendsTraveling').where('uid', '==', uid).get();
  const stale = snap.docs.filter((d) => !keep.has(d.ref.parent.parent?.id ?? ''));
  for (let i = 0; i < stale.length; i += 450) {
    const batch = db().batch();
    stale.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Makes every viewer's list agree with `uid`'s trip today. Returns the number of entries written. */
export async function syncTraveler(uid: string, now: Date = new Date()): Promise<number> {
  const userSnap = await db().doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user || user.settings?.showOnGlobe === false) { await deleteEntriesFor(uid); return 0; }

  const today = todayKey(now);
  const since = admin.firestore.Timestamp.fromMillis(now.getTime() - TWO_DAYS);
  const [own, joined] = await Promise.all([
    db().collection('trips').where('authorUid', '==', uid).where('endDate', '>=', since).get(),
    db().collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const trips = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const d of [...own.docs, ...joined.docs]) trips.set(d.id, d);

  const candidates: { id: string; title: string; trip: TripLike; city: string; lat: number; lng: number; dayStartMs: number }[] = [];
  for (const [id, d] of trips) {
    const trip = tripLike(d.data())!;
    if (!isTripUnderwayToday(trip, today)) continue;
    const days = await d.ref.collection('days').get();
    const dayLikes: DayLike[] = days.docs.map((x) => ({ dateMs: ms(x.get('date')), destinationIndex: x.get('destinationIndex') ?? null, dayNumber: x.get('dayNumber') ?? null }));
    const city = todaysCity(trip, dayLikes, today);
    if (!city) continue;
    const todayMs = dayLikes.map((x) => dayDateMs(trip, x)).find((m) => m != null && calendarDay(m) === today) ?? 0;
    candidates.push({ id, title: String(d.get('title') ?? ''), trip, ...city, dayStartMs: todayMs });
  }
  const chosen = pickTodayTrip(candidates);
  if (!chosen) { await deleteEntriesFor(uid); return 0; }

  const followers = (await db().collection('follows').where('followeeUid', '==', uid).get()).docs
    .map((d) => d.get('followerUid') as string).filter(Boolean);
  if (followers.length === 0) { await deleteEntriesFor(uid); return 0; }
  const blockedByTraveler = new Set((await db().collection(`users/${uid}/blocked`).get()).docs.map((d) => d.id));
  const theyBlocked = await db().getAll(...followers.map((v) => db().doc(`users/${v}/blocked/${uid}`)));
  const author = chosen.trip.authorUid ?? uid;
  const travelerIsAuthor = author === uid;
  const followsAuthor = travelerIsAuthor || chosen.trip.visibility !== 'followers'
    ? null
    : await db().getAll(...followers.map((v) => db().doc(`follows/${v}_${author}`)));

  const keep = new Set<string>();
  followers.forEach((v, i) => {
    if (shouldSeeTraveler({
      viewerFollowsTraveler: true,
      viewerFollowsAuthor: followsAuthor ? followsAuthor[i].exists || v === author : true,
      travelerIsAuthor,
      visibility: chosen.trip.visibility ?? '',
      showOnGlobe: user.settings?.showOnGlobe,
      blocked: blockedByTraveler.has(v) || theyBlocked[i].exists,
    })) keep.add(v);
  });

  const entry = {
    uid, name: String(user.fullName || user.username || ''), avatarUrl: user.avatarUrl ?? null,
    tripId: chosen.id, tripTitle: chosen.title, city: chosen.city, lat: chosen.lat, lng: chosen.lng,
    day: today, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const viewers = [...keep];
  for (let i = 0; i < viewers.length; i += 450) {
    const batch = db().batch();
    viewers.slice(i, i + 450).forEach((v) => batch.set(db().doc(`users/${v}/friendsTraveling/${uid}`), entry));
    await batch.commit();
  }
  await deleteEntriesFor(uid, keep);
  return viewers.length;
}

async function syncAll(uids: Iterable<string>): Promise<void> {
  const list = [...new Set([...uids].filter(Boolean))];
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map((u) => syncTraveler(u)));
}

const members = (t: TripLike | null) => (t ? [t.authorUid ?? '', ...(t.collaborators ?? [])] : []);

export const onTripWrittenFriends = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = tripLike(event.data?.before?.data());
  const after = tripLike(event.data?.after?.data());
  if (!travelInputsChanged(before, after)) return; // trips are written constantly
  await syncAll([...members(before), ...members(after)]);
});

export const onTripDayWrittenFriends = onDocumentWritten('trips/{tripId}/days/{dayId}', async (event) => {
  const b = event.data?.before?.data(), a = event.data?.after?.data();
  // The route editor rewrites dayNumber and destinationIndex; a stored date is rare.
  if (ms(b?.date) === ms(a?.date) && (b?.destinationIndex ?? null) === (a?.destinationIndex ?? null)
    && (b?.dayNumber ?? null) === (a?.dayNumber ?? null)) return;
  const trip = tripLike((await db().doc(`trips/${event.params.tripId}`).get()).data());
  if (!trip || !isTripUnderwayToday(trip, todayKey(new Date()))) return;
  await syncAll(members(trip));
});

export const onFollowWrittenFriends = onDocumentWritten('follows/{followId}', async (event) => {
  const uid = (event.data?.after?.get('followeeUid') ?? event.data?.before?.get('followeeUid')) as string | undefined;
  if (uid) await syncTraveler(uid);
});

export const onUserWrittenFriends = onDocumentWritten('users/{uid}', async (event) => {
  const b = event.data?.before?.data(), a = event.data?.after?.data();
  const keys = (d: admin.firestore.DocumentData | undefined) =>
    JSON.stringify([d?.settings?.showOnGlobe ?? null, d?.fullName ?? null, d?.username ?? null, d?.avatarUrl ?? null]);
  if (keys(b) === keys(a)) return;
  await syncTraveler(event.params.uid);
});

export const onBlockCreatedFriends = onDocumentCreated('users/{uid}/blocked/{blockedUid}', async (event) => {
  await syncAll([event.params.uid, event.params.blockedUid]);
});

export const refreshFriendsTraveling = onSchedule({ schedule: 'every 60 minutes', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const now = new Date();
  const today = todayKey(now);
  const since = admin.firestore.Timestamp.fromMillis(now.getTime() - TWO_DAYS);
  const trips = await db().collection('trips').where('endDate', '>=', since).get();
  const travelers = new Set<string>();
  for (const d of trips.docs) {
    const t = tripLike(d.data());
    if (t && isTripUnderwayToday(t, today)) members(t).forEach((u) => travelers.add(u));
  }
  // Entries left from a day that has passed (a trip just ended): resync those travellers to clear them.
  const stale = await db().collectionGroup('friendsTraveling').where('day', '<', today).get();
  stale.docs.forEach((d) => travelers.add(d.get('uid') as string));
  await syncAll(travelers);
});
