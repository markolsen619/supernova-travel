import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';
import { isPaidTier } from './flightPolling';
import { airportZone } from './airportTime';
import { airportInfo } from './airportInfo';
import { dayKey } from './friendsTraveling';
import { bufferMinutes, dueActions, leaveByMs, stayFor, type DayOfPass } from './dayOf';

const db = admin.firestore();
const HOUR = 3_600_000;

/** A clock time on the departure airport's own clock ("2:10 PM"), else UTC. */
function airportClock(ms: number, iata: string): string {
  const timeZone = airportZone(iata) ?? 'UTC';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(ms));
}
/** The departure's calendar day on the origin airport's clock. */
function airportDay(ms: number, iata: string): string {
  const timeZone = airportZone(iata) ?? 'UTC';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(ms));
}

/** Driving minutes with traffic between two points (Mapbox), or null when it can't tell. One call per Pro flight. */
async function driveMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<number | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const s = ((await r.json()) as { routes?: { duration?: number }[] }).routes?.[0]?.duration;
    return typeof s === 'number' ? Math.ceil(s / 60) : null;
  } catch {
    return null;
  }
}

/** Where the traveler sleeps before the flight: a hotel stop on the pass's trip (stayFor). */
async function stayForPass(tripId: string | null, departureDay: string): Promise<{ lat: number; lng: number } | null> {
  if (!tripId) return null;
  const tripRef = db.doc(`trips/${tripId}`);
  const trip = (await tripRef.get()).data();
  if (!trip) return null;
  const tripLike = {
    startDateMs: trip.startDate?.toMillis?.() ?? null, endDateMs: trip.endDate?.toMillis?.() ?? null,
    startDay: typeof trip.startDay === 'string' ? trip.startDay : null,
  };
  const days = await tripRef.collection('days').get();
  const stops: { dayKey: string; type: string; lat: number | null; lng: number | null }[] = [];
  for (const d of days.docs) {
    const key = dayKey(tripLike, { dateMs: null, destinationIndex: null, dayNumber: Number(d.get('dayNumber') ?? 0) });
    if (!key) continue;
    const acts = await d.ref.collection('activities').where('type', '==', 'hotel').get();
    for (const a of acts.docs) stops.push({ dayKey: key, type: 'hotel', lat: typeof a.get('lat') === 'number' ? a.get('lat') : null, lng: typeof a.get('lng') === 'number' ? a.get('lng') : null });
  }
  return stayFor(stops, departureDay);
}

/**
 * Day-of assistant (spec 2026-11-01-day-of-assistant-design.md), every 10 minutes: a check-in reminder ~24 h
 * before (everyone), the leave-by time worked out ~6 h before and the "leave for the airport" push 30 min ahead of
 * it (Pro). Each stamped in `dayOf` so it's sent once. No AviationStack calls; one Mapbox route per Pro flight.
 */
export const dayOfReminders = onSchedule({ schedule: 'every 10 minutes', timeZone: 'UTC', timeoutSeconds: 300, memory: '256MiB' }, async () => {
  const now = Date.now();
  const snap = await db.collection('boarding_passes')
    .where('departureTime', '>=', new Date(now - HOUR).toISOString())
    .where('departureTime', '<=', new Date(now + 25 * HOUR).toISOString())
    .get();
  const passes: (DayOfPass & { ref: FirebaseFirestore.DocumentReference })[] = snap.docs.map((d) => ({
    ref: d.ref, id: d.id, ownerUid: String(d.get('ownerUid') ?? ''), status: String(d.get('status') ?? 'upcoming'),
    departureMs: Date.parse(String(d.get('departureTime') ?? '')), origin: String(d.get('origin') ?? ''), destination: String(d.get('destination') ?? ''),
    airline: String(d.get('airline') ?? ''), flightNumber: String(d.get('flightNumber') ?? ''), destinationCity: String(d.get('destinationCity') ?? ''),
    tripId: typeof d.get('tripId') === 'string' ? d.get('tripId') : null, dayOf: d.get('dayOf') ?? {},
  })).filter((p) => p.ownerUid && Number.isFinite(p.departureMs));
  if (!passes.length) return;

  const owners = [...new Set(passes.map((p) => p.ownerUid))];
  const ownerDocs = await db.getAll(...owners.map((u) => db.doc(`users/${u}`)));
  const paid = new Set(ownerDocs.filter((o) => isPaidTier(o.get('tier'))).map((o) => o.id));
  const byId = new Map(passes.map((p) => [p.id, p]));

  const results = await Promise.allSettled(dueActions(passes, now, paid).map(async (a) => {
    const p = byId.get(a.passId)!;
    const flight = `${p.airline ? `${p.airline} ` : ''}${p.flightNumber}`.trim();
    if (a.kind === 'checkin') {
      await p.ref.update({ 'dayOf.checkInSentAtMs': now });
      await notifyUser(p.ownerUid, {
        notification: { type: 'checkin_open', passId: p.id, flightNumber: p.flightNumber },
        push: { title: `Check in for ${flight}${p.destinationCity ? ` to ${p.destinationCity}` : ''}`, body: 'Online check-in is usually open now.' },
      });
    } else if (a.kind === 'computeLeaveBy') {
      const bufferMin = bufferMinutes(p.origin, p.destination);
      const stay = await stayForPass(p.tripId, airportDay(p.departureMs, p.origin));
      const airport = airportInfo(p.origin);
      const driveMin = stay && airport ? await driveMinutes(stay, airport) : null;
      await p.ref.update({ 'dayOf.leaveByMs': leaveByMs(p.departureMs, bufferMin, driveMin), 'dayOf.driveMin': driveMin, 'dayOf.bufferMin': bufferMin });
    } else {
      const leaveBy = p.dayOf.leaveByMs!;
      const drive = p.dayOf.driveMin;
      await p.ref.update({ 'dayOf.leaveSentAtMs': now });
      await notifyUser(p.ownerUid, {
        notification: { type: 'leave_by', passId: p.id, flightNumber: p.flightNumber },
        push: drive != null
          ? { title: `Leave for the airport by ${airportClock(leaveBy, p.origin)}`, body: `About ${drive} min to ${p.origin} for ${flight}.` }
          : { title: `Be at ${p.origin} by ${airportClock(leaveBy, p.origin)}`, body: `For ${flight}${p.destinationCity ? ` to ${p.destinationCity}` : ''}.` },
      });
    }
  }));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) console.warn('dayOfReminders', { failed });
});
