import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';
import { dueCheckpoint, filterPassesForPaidOwners, groupPassesByFlight, LOOKAHEAD_HOURS, LOOKBACK_HOURS } from './flightPolling';
import { alertNotification, flightChanges, parseLiveFlight, type LiveResult } from './flightLive';

const db = admin.firestore();
const HOUR = 3_600_000;

// AviationStack (free plan: HTTP only, 100 calls a month — spec 2026-10-23).
function fetchLiveFlight(flightNumber: string, date: string): Promise<LiveResult> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) return Promise.resolve({ kind: 'none' });
  const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightNumber)}&flight_date=${date}`;
  return new Promise((resolve) => {
    const http = require('http');
    http.get(url, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(parseLiveFlight(JSON.parse(data))); } catch { resolve({ kind: 'none' }); }
      });
    }).on('error', () => resolve({ kind: 'none' }));
  });
}

/**
 * Every 30 minutes: Pro users' flights from 20 h ago to 3 h ahead, each checked at most three times
 * (flightPolling.dueCheckpoint), one call per real flight. Gate, delay, landed and cancelled changes are
 * saved on the pass (which also updates its Apple Wallet copy, appleWalletServiceFunctions.ts) and sent
 * with notifyUser.
 */
export const checkFlightStatus = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', memory: '256MiB' },
  async () => {
    const nowMs = Date.now();
    const snap = await db
      .collection('boarding_passes')
      .where('status', 'in', ['upcoming', 'boarded'])
      .where('departureTime', '>=', new Date(nowMs - LOOKBACK_HOURS * HOUR).toISOString())
      .where('departureTime', '<=', new Date(nowMs + LOOKAHEAD_HOURS * HOUR).toISOString())
      .get();

    const candidates = snap.docs.map((doc) => ({
      doc,
      ownerUid: doc.data().ownerUid as string,
      flightNumber: doc.data().flightNumber as string,
      departureTime: doc.data().departureTime as string,
      arrivalTime: doc.data().arrivalTime as string | undefined,
    })).filter((c) => c.flightNumber && c.departureTime);

    // Pro only, decided before anything is spent (one getAll for the distinct owners).
    const ownerUids = [...new Set(candidates.map((c) => c.ownerUid).filter(Boolean))];
    const tierByUid = new Map<string, string | undefined>();
    if (ownerUids.length > 0) {
      const userDocs = await db.getAll(...ownerUids.map((uid) => db.collection('users').doc(uid)));
      for (const userDoc of userDocs) tierByUid.set(userDoc.id, userDoc.data()?.tier as string | undefined);
    }
    const due = groupPassesByFlight(filterPassesForPaidOwners(candidates, tierByUid)).filter((group) => {
      const first = group.passes[0];
      const arrivalMs = first.arrivalTime ? Date.parse(first.arrivalTime) : null;
      return dueCheckpoint(Date.parse(first.departureTime), arrivalMs, nowMs) !== null;
    });

    for (const group of due) {
      const result = await fetchLiveFlight(group.flightNumber, group.departureDate);
      if (result.kind === 'limit') {
        console.warn('[checkFlightStatus] AviationStack monthly limit reached; no more checks this month', { code: result.code });
        break;
      }
      if (result.kind === 'error') console.warn('[checkFlightStatus] AviationStack error', { code: result.code });
      if (result.kind !== 'flight') continue;
      for (const { doc } of group.passes) {
        const pass = doc.data();
        const { patch, alerts } = flightChanges(pass, result.flight, Date.now());
        // update(), never set(): an edit the owner made a moment ago keeps every field this check didn't compute.
        await doc.ref.update(patch);
        for (const alert of alerts) await notifyUser(pass.ownerUid, alertNotification(alert, doc.id, pass.flightNumber));
      }
    }
  },
);
