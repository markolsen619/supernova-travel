import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';
import {
  filterPassesForPaidOwners,
  groupPassesByFlight,
  shouldPollFlight,
} from './flightPolling';

const db = admin.firestore();

// AviationStack flight lookup (free tier: HTTP only, no HTTPS)
async function fetchFlightStatus(flightNumber: string, date: string): Promise<string | null> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightNumber)}&flight_date=${date}`;
    // Use require('http') for AviationStack (free tier only allows HTTP)
    const http = require('http');
    http.get(url, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const flight = json.data?.[0];
          if (!flight) { resolve(null); return; }
          const status: string = flight.flight_status; // 'active'|'landed'|'cancelled'|'incident'|'diverted'|'scheduled'
          if (status === 'landed') resolve('completed');
          else if (status === 'active') resolve('boarded');
          else if (status === 'cancelled') resolve('cancelled');
          else resolve(null); // no change
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

export const checkFlightStatus = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', memory: '256MiB' },
  async () => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const snap = await db
      .collection('boarding_passes')
      .where('status', '==', 'upcoming')
      .where('departureTime', '>=', now.toISOString())
      .where('departureTime', '<=', in24h.toISOString())
      .get();

    // One API call per real flight, not per passenger, and only when this run
    // is due for that flight (see flightPolling.ts). Previously every pass in
    // the 24h window cost a call every 30 minutes — ten passengers on one
    // flight meant ten identical requests, and a single flight was polled
    // ~48 times over its last day.
    const candidates = snap.docs.map((doc) => ({
      doc,
      ownerUid: doc.data().ownerUid as string,
      flightNumber: doc.data().flightNumber as string,
      departureTime: doc.data().departureTime as string,
    }));

    // Live flight status is a paid feature, so decide who qualifies BEFORE
    // spending anything. This used to run after the API call, with only the
    // push suppressed — which is the expensive way round: a free user's
    // flight cost exactly as much to poll as a subscriber's.
    //
    // One getAll for the distinct owners. A Firestore read is orders of
    // magnitude cheaper than an AviationStack call, so reading every owner
    // to skip even a few flights pays for itself immediately.
    const ownerUids = [...new Set(candidates.map((c) => c.ownerUid).filter(Boolean))];
    const tierByUid = new Map<string, string | undefined>();
    if (ownerUids.length > 0) {
      const userDocs = await db.getAll(
        ...ownerUids.map((uid) => db.collection('users').doc(uid)),
      );
      for (const userDoc of userDocs) {
        tierByUid.set(userDoc.id, userDoc.data()?.tier as string | undefined);
      }
    }

    const payingCandidates = filterPassesForPaidOwners(candidates, tierByUid);

    const due = groupPassesByFlight(payingCandidates).filter((group) => {
      const hoursUntil =
        (new Date(group.passes[0].departureTime).getTime() - now.getTime()) / 3_600_000;
      return shouldPollFlight(hoursUntil, now);
    });

    for (const group of due) {
      const newStatus = await fetchFlightStatus(group.flightNumber, group.departureDate);
      if (!newStatus) continue;

      // One lookup, applied to every passenger on that flight.
      for (const { doc: passDoc } of group.passes) {
        const pass = passDoc.data();
        if (newStatus === pass.status) continue;

        await passDoc.ref.update({ status: newStatus });

        // No tier re-check here: filterPassesForPaidOwners above already
        // dropped every free owner, before anything was spent. tier is
        // server-written (syncTier / reconcileTier), so it can't be spoofed.

        const statusMessages: Record<string, string> = {
          boarded: `Your flight ${pass.flightNumber} is boarding now.`,
          completed: `Your flight ${pass.flightNumber} has landed.`,
          cancelled: `Your flight ${pass.flightNumber} has been cancelled.`,
        };

        const msg = statusMessages[newStatus];
        if (msg) {
          // notifyUser, not a bare push: a missed or permission-denied push
          // would otherwise leave the status change visible only inside the
          // wallet. It re-reads this user doc, which is one extra read per
          // changed flight — cheap next to the AviationStack call above.
          await notifyUser(pass.ownerUid, {
            notification: {
              type: 'flight_status',
              passId: passDoc.id,
              flightNumber: pass.flightNumber,
              status: newStatus,
            },
            push: { title: 'Flight update', body: msg },
          });
        }
      }
    }
  }
);
