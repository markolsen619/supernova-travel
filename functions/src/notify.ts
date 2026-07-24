import * as admin from 'firebase-admin';
import * as https from 'https';

const db = admin.firestore();

/**
 * Shared notify helper — writes the in-app notification doc AND sends the
 * push, so every notification-producing Cloud Function (trip invites now,
 * likes/comments/follows later) does both in one call instead of
 * reimplementing the push HTTP request per call site. Extracted from
 * checkFlightStatus.ts's inline sendPushNotification, generalized to take
 * arbitrary notification fields rather than being flight-status-specific.
 */
export interface NotifyPayload {
  /** Merged directly into users/{uid}/notifications/{autoId} — the
   * structured, in-app content (type, tripId, inviterName, ...). */
  notification: Record<string, unknown>;
  /** OS push copy — a single title/body string, separate from the
   * structured notification doc since push can't render structured data. */
  push: { title: string; body: string };
}

export async function notifyUser(uid: string, payload: NotifyPayload): Promise<void> {
  await db
    .collection('users')
    .doc(uid)
    .collection('notifications')
    .add({
      ...payload.notification,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  const userDoc = await db.collection('users').doc(uid).get();
  const tokens: string[] = userDoc.data()?.expoPushTokens ?? [];
  await sendPushNotification(tokens, payload.push.title, payload.push.body);
}

async function sendPushNotification(tokens: string[], title: string, body: string): Promise<void> {
  const messages = tokens
    .filter((t) => t.startsWith('ExponentPushToken['))
    .map((to) => ({ to, title, body, sound: 'default' }));

  if (messages.length === 0) return;

  const payload = JSON.stringify(messages);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      () => resolve()
    );
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}
