/**
 * Apple's PassKit web service, the pure part (spec 2026-10-23 §3): routes, auth header, which pass changes
 * reach Wallet, and the "passes updated since" answer. Wiring in appleWalletServiceFunctions.ts.
 */
export const WALLET_SERVICE_URL = 'https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService';

export type WalletRoute =
  | { kind: 'register' | 'unregister'; device: string; passType: string; serial: string }
  | { kind: 'serials'; device: string; passType: string }
  | { kind: 'pass'; passType: string; serial: string }
  | { kind: 'log' };

const SEG = /^[A-Za-z0-9._-]+$/;

export function parseWalletServicePath(method: string, path: string): WalletRoute | null {
  const s = path.split('/').filter(Boolean);
  if (s[0] !== 'v1' || !s.slice(1).every((x) => SEG.test(x))) return null;
  if (s[1] === 'devices' && s[3] === 'registrations') {
    if (s.length === 6 && (method === 'POST' || method === 'DELETE')) {
      return { kind: method === 'POST' ? 'register' : 'unregister', device: s[2], passType: s[4], serial: s[5] };
    }
    if (s.length === 5 && method === 'GET') return { kind: 'serials', device: s[2], passType: s[4] };
    return null;
  }
  if (s[1] === 'passes' && s.length === 4 && method === 'GET') return { kind: 'pass', passType: s[2], serial: s[3] };
  if (s[1] === 'log' && s.length === 2 && method === 'POST') return { kind: 'log' };
  return null;
}

export function passIdFromSerial(serial: string): string | null {
  const m = /^bp-([A-Za-z0-9_-]+)$/.exec(serial);
  return m ? m[1] : null;
}

export function tokenFromAuthHeader(h: string | undefined): string | null {
  const m = /^ApplePass (\S+)$/.exec(h ?? '');
  return m ? m[1] : null;
}

/** The fields passJson reads, plus the live ones. Never walletUpdatedAtMs (its own write would loop). */
const WALLET_FIELDS = ['airline', 'flightNumber', 'origin', 'originCity', 'destination', 'destinationCity', 'departureTime',
  'arrivalTime', 'seat', 'gate', 'terminal', 'boardingGroup', 'barcode', 'barcodeFormat', 'status', 'delayMinutes', 'liveDepartureLocal'];

export function walletFieldsChanged(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): boolean {
  if (!before || !after) return false;
  if (WALLET_FIELDS.some((k) => (before[k] ?? null) !== (after[k] ?? null))) return true;
  return Boolean(before.liveCheckedAtMs) !== Boolean(after.liveCheckedAtMs);
}

export function serialsUpdatedSince(rows: { serial: string; updatedAtMs: number }[], since: string | undefined): { serialNumbers: string[]; lastUpdated: string } | null {
  const after = since !== undefined && Number.isFinite(Number(since)) ? Number(since) : -1;
  const changed = rows.filter((r) => r.updatedAtMs > after);
  if (changed.length === 0) return null;
  return { serialNumbers: changed.map((r) => r.serial), lastUpdated: String(Math.max(...rows.map((r) => r.updatedAtMs))) };
}
