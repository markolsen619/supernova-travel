import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';

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

    for (const passDoc of snap.docs) {
      const pass = passDoc.data();
      const departureDate = pass.departureTime.slice(0, 10); // YYYY-MM-DD
      const newStatus = await fetchFlightStatus(pass.flightNumber, departureDate);

      if (newStatus && newStatus !== pass.status) {
        await passDoc.ref.update({ status: newStatus });

        const userDoc = await db.collection('users').doc(pass.ownerUid).get();
        const userData = userDoc.data();

        // The status write above is for everyone — the wallet shows it. The
        // push is Flight Alerts, a Pro feature on the paywall. tier is
        // server-written (syncTier / reconcileTier), so this can't be spoofed.
        if ((userData?.tier ?? 'free') === 'free') continue;

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
