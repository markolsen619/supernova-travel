/**
 * `ticketsReminder` — daily at 15:00 UTC (morning in the Americas, evening in Europe): trips starting in 7 days with 2+
 * activity stops still unbooked get one push to the owner and members (rules in ticketsReminder.ts). Sent once per
 * trip, marked in server-only `tripReminders/{tripId}` (never on the trip doc, whose writes re-run every trip trigger).
 */
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';
import { tripDays } from './friendsTraveling';
import { reminderDue, reminderToday, stopsNeedingTickets, ticketsReminderCopy } from './ticketsReminder';

const db = admin.firestore();
const DAY = 86_400_000;

export const ticketsReminder = onSchedule({ schedule: 'every day 15:00', timeZone: 'UTC', timeoutSeconds: 300, memory: '256MiB' }, async () => {
  const now = Date.now();
  const today = reminderToday(now);
  const trips = await db.collection('trips')
    .where('startDate', '>=', admin.firestore.Timestamp.fromMillis(now + 5 * DAY))
    .where('startDate', '<=', admin.firestore.Timestamp.fromMillis(now + 9 * DAY))
    .get();
  let sent = 0;
  for (const t of trips.docs) {
    try {
      const d = t.data();
      const span = tripDays({ startDateMs: d.startDate?.toMillis?.() ?? null, endDateMs: d.endDate?.toMillis?.() ?? d.startDate?.toMillis?.() ?? null, startDay: typeof d.startDay === 'string' ? d.startDay : null });
      const markRef = db.doc(`tripReminders/${t.id}`);
      const already = (await markRef.get()).get('ticketsAtMs');
      if (!span || already) continue;
      const days = await t.ref.collection('days').get();
      let stops: FirebaseFirestore.DocumentData[] = [];
      for (const day of days.docs) stops = stops.concat((await day.ref.collection('activities').get()).docs.map((a) => a.data()));
      const count = stopsNeedingTickets(stops);
      if (!reminderDue({ startDay: span.start, count, alreadySent: !!already }, today)) continue;
      await markRef.set({ ticketsAtMs: now }, { merge: true });
      const city = String(d.destination?.name ?? d.title ?? 'Your trip');
      const copy = ticketsReminderCopy(city, count);
      const members: string[] = [String(d.authorUid), ...((d.collaborators ?? []) as string[])];
      await Promise.allSettled([...new Set(members)].map((uid) => notifyUser(uid, {
        notification: { type: 'tickets_reminder', tripId: t.id, count },
        push: copy,
      })));
      sent++;
    } catch (err) {
      console.warn('ticketsReminder: trip failed', { tripId: t.id, err: String(err).slice(0, 160) });
    }
  }
  console.log('ticketsReminder', { candidates: trips.size, sent });
});
