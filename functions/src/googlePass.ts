/**
 * Google Wallet boarding pass (spec 2026-10-23-google-wallet-pass-design.md): a generic pass, pure. Same whitelist as
 * the Apple pass (applePass.ts) — never the owner, notes, booking references or trip data.
 */
import { statusLine, type PassInput } from './applePass';
import { airportZone } from './airportTime';

export const ISSUER_ID = '3388000000023211693';
export const CLASS_ID = `${ISSUER_ID}.supernova_boarding_pass`;
export const WALLET_SERVICE_ACCOUNT = 'supernova-wallet@supernova-a2125.iam.gserviceaccount.com';
const LOGO = 'https://supernova-a2125.web.app/wallet/google-logo.png';

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const loc = (value: string) => ({ defaultValue: { language: 'en-US', value } });
const BARCODES: Record<string, string> = { qr: 'QR_CODE', pdf417: 'PDF_417', aztec: 'AZTEC', code128: 'CODE_128' };

export function googleObjectId(passId: string): string | null {
  return /^[A-Za-z0-9_-]+$/.test(passId) ? `${ISSUER_ID}.bp_${passId}` : null;
}

function validZone(timeZone: string | null): string | null {
  if (!timeZone) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return timeZone; } catch { return null; }
}

/** "Sun, Nov 1 · 10:20" in the traveler's zone; "… 09:20 UTC" when the zone is unknown. */
export function formatDeparture(iso: string | undefined, timeZone: string | null): string | null {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return null;
  const zone = validZone(timeZone);
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone ?? 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone ?? 'UTC' }).format(d);
  return `${day} · ${time}${zone ? '' : ' UTC'}`;
}

export function genericObject(p: PassInput, timeZone: string | null): Record<string, unknown> {
  const from = text(p.originCity) ?? text(p.origin) ?? '—';
  const to = text(p.destinationCity) ?? text(p.destination) ?? '—';
  const modules: { id: string; header: string; body: string }[] = [];
  const add = (id: string, header: string, body: string | null) => { if (body) modules.push({ id, header, body }); };
  // The origin airport's clock (what the airline prints); the phone's zone only for an airport the table doesn't know.
  add('departs', 'Departs', formatDeparture(p.departureTime, airportZone(p.origin) ?? timeZone));
  add('seat', 'Seat', text(p.seat));
  add('gate', 'Gate', text(p.gate));
  add('terminal', 'Terminal', text(p.terminal));
  add('group', 'Group', text(p.boardingGroup));
  add('status', 'Status', statusLine(p));

  const o: Record<string, unknown> = {
    id: googleObjectId(p.id),
    classId: CLASS_ID,
    state: 'ACTIVE',
    cardTitle: loc('Supernova'),
    header: loc(`${from} → ${to}`),
    subheader: loc(text(p.flightNumber) ?? text(p.airline) ?? 'Flight'),
    hexBackgroundColor: '#1a1035',
    logo: { sourceUri: { uri: LOGO }, contentDescription: loc('Supernova') },
    textModulesData: modules,
  };
  if (text(p.barcode)) o.barcode = { type: BARCODES[p.barcodeFormat ?? ''] ?? 'QR_CODE', value: text(p.barcode) };
  const dep = Date.parse(p.departureTime ?? '');
  if (Number.isFinite(dep)) o.validTimeInterval = { end: { date: new Date(dep + 24 * 3_600_000).toISOString() } };
  return o;
}

const field = (id: string) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } });
const row = (a: string, b: string, c: string) => ({ threeItems: { startItem: field(a), middleItem: field(b), endItem: field(c) } });

/** The class carries the card layout: departure, gate and seat on the front — what you need at the airport — then terminal, group, status. */
export function genericClass(): Record<string, unknown> {
  return {
    id: CLASS_ID,
    classTemplateInfo: { cardTemplateOverride: { cardRowTemplateInfos: [row('departs', 'gate', 'seat'), row('terminal', 'group', 'status')] } },
  };
}

export function saveJwtClaims(object: Record<string, unknown>, nowS: number): Record<string, unknown> {
  return { iss: WALLET_SERVICE_ACCOUNT, aud: 'google', typ: 'savetowallet', iat: nowS, exp: nowS + 3600, origins: [], payload: { genericObjects: [object] } };
}

/** What a deleted pass becomes in Google Wallet: inactive and stripped — the barcode holds the passenger's name and booking reference. */
export function inactiveObject(passId: string): Record<string, unknown> {
  return { id: googleObjectId(passId), classId: CLASS_ID, state: 'INACTIVE', cardTitle: loc('Supernova'), header: loc('Boarding pass removed') };
}
