/**
 * Google Wallet calls as supernova-wallet without a key file (spec §Signing): the functions' own account asks the IAM
 * Credentials API to sign the save JWT and to mint a Wallet access token on supernova-wallet's behalf.
 */
import * as admin from 'firebase-admin';
import { CLASS_ID, WALLET_SERVICE_ACCOUNT, genericClass } from './googlePass';

const IAM = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(WALLET_SERVICE_ACCOUNT)}`;
const WALLET = 'https://walletobjects.googleapis.com/walletobjects/v1';
/** Every Google call gives up after 10 s, so a hung Wallet or IAM call can't hold the trigger (and the Apple push) to its timeout. */
const TIMEOUT_MS = 10_000;

async function ownToken(): Promise<string> {
  return (await admin.credential.applicationDefault().getAccessToken()).access_token;
}

async function iam<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${IAM}:${method}`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Authorization: `Bearer ${await ownToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`IAM ${method} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function signSaveJwt(claims: Record<string, unknown>): Promise<string> {
  return (await iam<{ signedJwt: string }>('signJwt', { payload: JSON.stringify(claims) })).signedJwt;
}

let walletToken: { value: string; expiresMs: number } | null = null;
async function walletAuth(): Promise<string> {
  if (walletToken && walletToken.expiresMs > Date.now() + 60_000) return walletToken.value;
  const r = await iam<{ accessToken: string; expireTime: string }>('generateAccessToken', { scope: ['https://www.googleapis.com/auth/wallet_object.issuer'], lifetime: '3600s' });
  walletToken = { value: r.accessToken, expiresMs: Date.parse(r.expireTime) };
  return r.accessToken;
}

async function wallet(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${WALLET}${path}`, { method, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Authorization: `Bearer ${await walletAuth()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}

let classReady = false;
export async function ensureClass(): Promise<void> {
  if (classReady) return;
  const got = await wallet('GET', `/genericClass/${CLASS_ID}`);
  if (got.status === 404) {
    const made = await wallet('POST', '/genericClass', genericClass());
    if (!made.ok && made.status !== 409) throw new Error(`genericClass insert failed: HTTP ${made.status} ${(await made.text()).slice(0, 200)}`);
  } else if (!got.ok) {
    throw new Error(`genericClass get failed: HTTP ${got.status}`);
  }
  classReady = true;
}

/**
 * Replaces a saved pass (PUT, not PATCH: a field that's gone — a removed barcode — must go from Wallet too);
 * 'missing' when it was never saved (the JWT was minted but not used).
 */
export async function putObject(id: string, object: Record<string, unknown>): Promise<'ok' | 'missing'> {
  const res = await wallet('PUT', `/genericObject/${id}`, object);
  if (res.status === 404) return 'missing';
  if (!res.ok) throw new Error(`genericObject update failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return 'ok';
}
