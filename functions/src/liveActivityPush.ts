/**
 * Day-of assistant (spec 2026-11-01 §4): server updates to a flight's iPhone Live Activity while the app is closed.
 * Pure: the APNs payload (content-state = expo-live-activity's ContentState) and the ES256 provider token. The text
 * mirrors the app's `liveActivityContent` (utils/dayOf.ts — a separate TypeScript project, so it can't be shared).
 * Sending (`pushLiveActivity`) runs only when APNS_LA_KEY / APNS_LA_KEY_ID are set; without them nothing happens.
 */
import { createSign } from 'crypto';
import * as http2 from 'http2';

export const LA_TOPIC = 'com.supernovatravel.app.push-type.liveactivity';
export const APPLE_TEAM_ID = 'R47484PAGA';
const H = 3_600_000;

export interface LaPass {
  flightNumber: string; origin: string; destination: string; destinationCity?: string | null; status: string;
  departureTime: string; arrivalTime?: string | null; gate?: string | null; seat?: string | null; delayMinutes?: number | null;
}

export interface LaPayload {
  aps: {
    timestamp: number; event: 'update' | 'end'; 'dismissal-date'?: number;
    'content-state': { title: string; subtitle: string; timerEndDateInMilliseconds: number; imageName: 'star'; dynamicIslandImageName: 'star' };
  };
}

export function liveActivityPayload(p: LaPass, nowMs: number): LaPayload {
  const dep = Date.parse(p.departureTime);
  const arr = p.arrivalTime ? Date.parse(p.arrivalTime) : NaN;
  const cancelled = p.status === 'cancelled';
  const ended = cancelled || p.status === 'completed' || (Number.isFinite(arr) ? nowMs >= arr : nowMs >= dep + 3 * H);
  const delay = p.delayMinutes ?? 0;
  const bits = cancelled ? ['Cancelled']
    : delay >= 15 ? [`Delayed ${delay} min`]
      : [p.gate ? `Gate ${p.gate}` : null, p.seat ? `Seat ${p.seat}` : null].filter((x): x is string => !!x);
  const nowSec = Math.floor(nowMs / 1000);
  return {
    aps: {
      timestamp: nowSec,
      event: ended ? 'end' : 'update',
      ...(ended ? { 'dismissal-date': nowSec + 15 * 60 } : {}),
      'content-state': {
        title: `${p.flightNumber} · ${p.origin} → ${p.destination}`,
        subtitle: bits.length ? bits.join(' · ') : `To ${p.destinationCity || p.destination}`,
        timerEndDateInMilliseconds: dep + Math.max(0, delay) * 60_000,
        imageName: 'star', dynamicIslandImageName: 'star',
      },
    },
  };
}

/** APNs provider token: ES256 over header.claims, signature as raw r||s (JWS), not DER. */
export function apnsJwt(keyPem: string, keyId: string, teamId: string, nowSec: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${enc({ alg: 'ES256', kid: keyId })}.${enc({ iss: teamId, iat: nowSec })}`;
  const sig = createSign('SHA256').update(input).sign({ key: keyPem, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

/** The configured key, or null (the owner hasn't created one yet). `\n` escapes in .env are restored. */
export function laKeyFromEnv(env: NodeJS.ProcessEnv): { key: string; keyId: string } | null {
  const key = env.APNS_LA_KEY?.replace(/\\n/g, '\n').trim();
  const keyId = env.APNS_LA_KEY_ID?.trim();
  return key && keyId ? { key, keyId } : null;
}

/**
 * Sends one Live Activity push. Returns 'gone' when APNs says the token is dead (410 / BadDeviceToken) so the
 * caller can drop it; never throws.
 */
export async function pushLiveActivity(token: string, payload: LaPayload, creds: { key: string; keyId: string }, host = 'https://api.push.apple.com'): Promise<'ok' | 'gone' | 'failed'> {
  let session: http2.ClientHttp2Session;
  try {
    session = http2.connect(host);
  } catch (e) {
    console.warn('[liveActivity] could not connect', (e as Error).message);
    return 'failed';
  }
  session.on('error', (e) => console.warn('[liveActivity] session error', e.message));
  try {
    const jwt = apnsJwt(creds.key, creds.keyId, APPLE_TEAM_ID, Math.floor(Date.now() / 1000));
    return await new Promise((resolve) => {
      const req = session.request({
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${jwt}`,
        'apns-topic': LA_TOPIC, 'apns-push-type': 'liveactivity', 'apns-priority': '10', 'content-type': 'application/json',
      });
      let status = 0; let body = '';
      req.setTimeout(10_000, () => { req.close(); resolve('failed'); });
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (status === 200) return resolve('ok');
        if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) return resolve('gone');
        console.warn('[liveActivity] push failed', { status, body: body.slice(0, 200) });
        resolve('failed');
      });
      req.on('error', (e) => { console.warn('[liveActivity] request error', e.message); resolve('failed'); });
      req.end(JSON.stringify(payload));
    });
  } catch (e) {
    console.warn('[liveActivity] could not sign', (e as Error).message);
    return 'failed';
  } finally {
    session.close();
  }
}
