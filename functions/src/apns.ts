/**
 * Tells Apple Wallet a pass changed (spec 2026-10-23 §3): an empty JSON payload per device push token, topic = the
 * pass type id, over HTTP/2 with the pass certificate. Returns the tokens APNs says are gone (410, or 400
 * BadDeviceToken) so their registrations can be dropped.
 */
import * as http2 from 'http2';
import { PASS_TYPE_ID } from './applePass';

export async function pushPassUpdates(tokens: string[], creds: { cert: string; key: string }): Promise<string[]> {
  if (tokens.length === 0) return [];
  const session = http2.connect('https://api.push.apple.com', { cert: creds.cert, key: creds.key });
  const gone: string[] = [];
  try {
    await Promise.all(tokens.map((token) => new Promise<void>((resolve) => {
      const req = session.request({ ':method': 'POST', ':path': `/3/device/${token}`, 'apns-topic': PASS_TYPE_ID, 'content-type': 'application/json' });
      let status = 0; let body = '';
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) gone.push(token);
        else if (status !== 200) console.warn('[apns] pass push failed', { status, body: body.slice(0, 200) });
        resolve();
      });
      req.on('error', (e) => { console.warn('[apns] request error', e.message); resolve(); });
      req.end('{}');
    })));
  } finally {
    session.close();
  }
  return gone;
}
