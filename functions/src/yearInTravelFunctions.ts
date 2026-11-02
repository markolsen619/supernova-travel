import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { summaryCacheKey, tripRange, yearSummary, type YTTrip, type YearSummary } from './yearInTravel';

const db = admin.firestore();
const DAY_MS = 86_400_000;
const toDate = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toDate() : null);
const ms = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toMillis() : 0);

/** The caller's travel year (Year in Travel), cached a day in users/{uid}/private/yearInTravel_{year}. */
export const yearInTravel = onCall({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 60 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const year = Number((req.data as { year?: unknown })?.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new HttpsError('invalid-argument', 'year is required');
  const now = Date.now();
  const [own, joined] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const all = [...own.docs, ...joined.docs.filter((j) => !own.docs.some((o) => o.id === j.id))];
  // On the traveler's own calendar (tripRange), not UTC.
  const rangeOf = (t: FirebaseFirestore.QueryDocumentSnapshot) => tripRange({
    startDateMs: ms(t.get('startDate')) || null, endDateMs: ms(t.get('endDate')) || null, startDay: typeof t.get('startDay') === 'string' ? t.get('startDay') : null,
  });
  const inYear = all.filter((t) => {
    const r = rangeOf(t);
    return r && r.start.getUTCFullYear() <= year && r.end.getUTCFullYear() >= year;
  });
  const cacheRef = db.doc(`users/${uid}/private/yearInTravel_${year}`);
  const cached = (await cacheRef.get()).data() as (YearSummary & { cacheKey?: string }) | undefined;
  // Recompute when a trip joins or leaves the year, any counted trip changes, the rules change, or after a day
  // (stop and journal edits don't touch the trip document).
  const cacheKey = summaryCacheKey(inYear.map((t) => ({ id: t.id, updatedAtMs: ms(t.get('updatedAt')) })));
  if (cached && cached.cacheKey === cacheKey && now - cached.computedAtMs < DAY_MS) {
    const { cacheKey: _k, ...summary } = cached;
    return summary;
  }

  const trips: YTTrip[] = await Promise.all(inYear.map(async (t) => {
    const d = t.data();
    const days = await t.ref.collection('days').get();
    const dayRows = await Promise.all(days.docs.map(async (day) => {
      const acts = await day.ref.collection('activities').get();
      const stops = await Promise.all(acts.docs.map(async (a) => {
        const journal = d.authorUid === uid ? (await a.ref.collection('journal').doc('entry').get()).get('photoUrls') : null;
        return { lat: typeof a.get('lat') === 'number' ? a.get('lat') : null, lng: typeof a.get('lng') === 'number' ? a.get('lng') : null,
          type: String(a.get('type') ?? 'activity'), order: Number(a.get('order') ?? 0),
          photoUrls: Array.isArray(journal) ? journal.filter((u: unknown): u is string => typeof u === 'string') : [] };
      }));
      return { dayNumber: Number(day.get('dayNumber') ?? 0), stops };
    }));
    const dests = [d.destination, ...(d.additionalDestinations ?? [])].filter(Boolean);
    return { id: t.id, title: String(d.title ?? 'Trip'), authorUid: d.authorUid, members: [d.authorUid, ...(d.collaborators ?? [])],
      start: rangeOf(t)?.start ?? null, end: rangeOf(t)?.end ?? null, travelStyles: Array.isArray(d.travelStyles) ? d.travelStyles : [],
      cities: dests.map((x: { name?: string; countryCode?: string; lat?: number; lng?: number }) => ({ name: String(x.name ?? ''), countryCode: x.countryCode ?? null,
        lat: typeof x.lat === 'number' ? x.lat : null, lng: typeof x.lng === 'number' ? x.lng : null })).filter((c: { name: string }) => c.name),
      days: dayRows };
  }));
  const reviews = await db.collection('placeReviews').where('authorUid', '==', uid).get();
  // Never a review moderation hid: these can end up on a shared image.
  const reviewPhotos = reviews.docs.filter((r) => { const c = toDate(r.get('createdAt')); return r.get('moderationHidden') !== true && c && c.getUTCFullYear() === year; })
    .flatMap((r) => (Array.isArray(r.get('photoUrls')) ? r.get('photoUrls') : []));
  const memberIds = [...new Set(trips.flatMap((t) => t.members).filter((m) => m && m !== uid))].slice(0, 30);
  const [profileDocs, blockedDocs] = await Promise.all([
    memberIds.length ? db.getAll(...memberIds.map((m) => db.doc(`users/${m}`))) : Promise.resolve([]),
    db.collection(`users/${uid}/blocked`).get(),
  ]);
  const profiles: Record<string, { name: string; avatarUrl: string | null }> = {};
  for (const p of profileDocs) if (p.exists) profiles[p.id] = { name: String(p.get('fullName') ?? p.get('displayName') ?? 'Traveler'), avatarUrl: p.get('avatarUrl') ?? null };
  const upcoming = all.map((t) => ({ tripId: t.id, title: String(t.get('title') ?? 'Trip'), startMs: ms(t.get('startDate')) })).filter((t) => t.startMs > now);
  const summary = yearSummary({ uid, year, nowMs: now, trips, reviewPhotos, profiles, blocked: new Set(blockedDocs.docs.map((b) => b.id)), upcoming });
  await cacheRef.set({ ...summary, cacheKey });
  return summary;
});
