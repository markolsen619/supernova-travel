/**
 * Calendar feed wiring (spec 2026-10-19): token callables, and the HTTPS feed served at /cal/{token}.ics.
 * The token lives in users/{uid}/private/calendar (owner-read, server-write) and calendarFeeds/{token} (server-only).
 */
import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { buildCalendar, DEFAULT_TYPES, isFeedRequest, newFeedToken, tokenFromPath, tripsWorthLoading, type CalTypes, type CalTrip } from './calendarFeed';

const db = admin.firestore();
const privateDoc = (uid: string) => db.doc(`users/${uid}/private/calendar`);
/** generateTrip stopped writing stop times on 2026-10-09 (ff914ee); older AI trips carry guessed times. */
const AI_TIMES_STOPPED_MS = Date.parse('2026-10-09T00:00:00Z');

async function liveTokens(uid: string): Promise<string[]> {
  return (await db.collection('calendarFeeds').where('uid', '==', uid).get()).docs.map((d) => d.id);
}

async function issue(uid: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = newFeedToken();
    try {
      await db.doc(`calendarFeeds/${token}`).create({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await privateDoc(uid).set({ token, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return token;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS → another token
    }
  }
  throw new HttpsError('internal', 'Could not create a calendar link. Try again.');
}

function requireUid(request: { auth?: { uid: string } }): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

export const createCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  const live = await liveTokens(uid);
  if (live.length > 0) {
    await privateDoc(uid).set({ token: live[0] }, { merge: true });
    return { token: live[0] };
  }
  return { token: await issue(uid) };
});

export const rotateCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  // Old links die first, so a failure can never leave two live ones.
  await Promise.all((await liveTokens(uid)).map((t) => db.doc(`calendarFeeds/${t}`).delete()));
  return { token: await issue(uid) };
});

export const disableCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  await Promise.all((await liveTokens(uid)).map((t) => db.doc(`calendarFeeds/${t}`).delete()));
  await privateDoc(uid).delete();
  return { ok: true };
});

export const setCalendarTypes = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  const raw = (request.data as { types?: Record<string, unknown> } | undefined)?.types ?? {};
  const current = ((await privateDoc(uid).get()).get('types') ?? {}) as Partial<CalTypes>;
  const types: CalTypes = { ...DEFAULT_TYPES, ...current };
  for (const k of Object.keys(DEFAULT_TYPES) as (keyof CalTypes)[]) {
    if (typeof raw[k] === 'boolean') types[k] = raw[k] as boolean;
  }
  await privateDoc(uid).set({ types }, { merge: true });
  return { types };
});

async function loadTrips(uid: string): Promise<CalTrip[]> {
  const [own, joined] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const byId = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const d of [...own.docs, ...joined.docs]) byId.set(d.id, d);
  // Only trips ending within the window have their days read (final review: cost grew with history).
  const candidates = tripsWorthLoading(
    [...byId.values()].map((doc) => ({ doc, endDateMs: (doc.get('endDate')?.toMillis?.() as number | undefined) ?? null })),
    new Date(),
  ).map((c) => c.doc);
  return Promise.all(candidates.map(async (t) => {
    const daysSnap = await t.ref.collection('days').get();
    const days = await Promise.all(daysSnap.docs.map(async (d) => {
      const acts = await d.ref.collection('activities').get();
      const dd = d.data();
      const trip = t.data();
      const dests = [trip.destination, ...(trip.additionalDestinations ?? [])];
      return {
        id: d.id,
        dayNumber: typeof dd.dayNumber === 'number' ? dd.dayNumber : null,
        dateMs: dd.date?.toMillis?.() ?? null,
        city: dests[typeof dd.destinationIndex === 'number' ? dd.destinationIndex : 0]?.name ?? null,
        stops: acts.docs.map((a) => ({ id: a.id, title: a.get('title'), startTime: a.get('startTime') ?? null, endTime: a.get('endTime') ?? null, order: a.get('order') ?? 0 })),
      };
    }));
    const data = t.data();
    return {
      id: t.id, title: data.title, region: data.region ?? data.destination?.name ?? null,
      startDateMs: data.startDate?.toMillis?.() ?? null, endDateMs: data.endDate?.toMillis?.() ?? null,
      startDay: typeof data.startDay === 'string' ? data.startDay : null, days,
      aiTimesUntrusted: data.isAiGenerated === true && (data.createdAt?.toMillis?.() ?? 0) < AI_TIMES_STOPPED_MS,
    };
  }));
}

export const calendarFeed = onRequest({ region: 'us-central1' }, async (req, res) => {
  const token = isFeedRequest(req.method) ? tokenFromPath(req.path) : null;
  const feed = token ? await db.doc(`calendarFeeds/${token}`).get() : null;
  if (!feed?.exists) { res.status(404).send(''); return; }
  const uid = feed.get('uid') as string;
  const [trips, passes, reservations, priv] = await Promise.all([
    loadTrips(uid),
    db.collection('boarding_passes').where('ownerUid', '==', uid).get(),
    db.collection('reservations').where('ownerUid', '==', uid).get(),
    privateDoc(uid).get(),
  ]);
  const ics = buildCalendar({
    trips,
    passes: passes.docs.map((d) => ({ id: d.id, ...d.data() })),
    reservations: reservations.docs.map((d) => ({ id: d.id, ...d.data() })) as never,
    types: (priv.get('types') ?? {}) as Partial<CalTypes>,
  }, new Date());
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'private, max-age=900');
  res.status(200).send(ics);
});
