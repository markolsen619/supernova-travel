// functions/src/walletLink.ts
/**
 * Short-lived links to a boarding pass's Apple Wallet file (spec 2026-10-22 §1): `payload.signature`, both
 * base64url; payload = `passId.uid.expiresAtMs`, signature = HMAC-SHA256(secret, payload). Nothing is stored.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const WALLET_LINK_TTL_MS = 5 * 60_000;

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function signWalletToken(p: { passId: string; uid: string }, secret: string, now: number): string {
  const payload = Buffer.from(`${p.passId}.${p.uid}.${now + WALLET_LINK_TTL_MS}`).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyWalletToken(token: string, secret: string, now: number): { passId: string; uid: string } | null {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const parts = Buffer.from(payload, 'base64url').toString('utf8').split('.');
  if (parts.length !== 3) return null;
  const [passId, uid, exp] = parts;
  if (!passId || !uid || !(Number(exp) > now)) return null;
  return { passId, uid };
}

/** Firestore ids and uids are [A-Za-z0-9]; base64url adds - and _. */
export function walletTokenFromPath(path: string): string | null {
  const m = /^\/wallet\/apple\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:\.pkpass)?$/.exec(path);
  return m ? m[1] : null;
}
