/**
 * Tells Apple Wallet a pass changed (spec 2026-10-23 §3): an empty JSON payload per device push token, topic = the
 * pass type id, over HTTP/2 with the pass certificate. Returns the tokens APNs says are gone (410, or 400
 * BadDeviceToken) so their registrations can be dropped.
 */
import * as http2 from 'http2';
import { PASS_TYPE_ID } from './applePass';

export async function pushPassUpdates(tokens: string[], creds: { cert: string; key: string }, host = 'https://api.push.apple.com'): Promise<string[]> {
  if (tokens.length === 0) return [];
  let session: http2.ClientHttp2Session;
  try {
    session = http2.connect(host, { cert: creds.cert, key: creds.key });
  } catch (e) {
    // An unreadable certificate secret: log it, never take the trigger down.
    console.warn('[apns] could not connect', (e as Error).message);
    return [];
  }
  const gone: string[] = [];
  const open = new Set<() => void>();
  // Without this listener a TLS or network failure is an uncaught 'error' that kills the instance.
  session.on('error', (e) => {
    console.warn('[apns] session error', e.message);
    for (const finish of open) finish();
  });
  try {
    await Promise.all(tokens.map((token) => new Promise<void>((resolve) => {
      const finish = () => { open.delete(finish); resolve(); };
      open.add(finish);
      if (session.destroyed) return finish();
      const req = session.request({ ':method': 'POST', ':path': `/3/device/${token}`, 'apns-topic': PASS_TYPE_ID, 'content-type': 'application/json' });
      let status = 0; let body = '';
      req.setTimeout(10_000, () => { console.warn('[apns] request timed out'); req.close(); finish(); });
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) gone.push(token);
        else if (status !== 200) console.warn('[apns] pass push failed', { status, body: body.slice(0, 200) });
        finish();
      });
      req.on('error', (e) => { console.warn('[apns] request error', e.message); finish(); });
      req.end('{}');
    })));
  } finally {
    session.close();
  }
  return gone;
}
