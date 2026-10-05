/**
 * Email import's rules (Part 2 of the premium wallet). Pure — no
 * firebase-admin, no mailparser — so it is unit-tested; inboundEmail
 * (emailImportFunctions.ts) does the I/O. Spec: docs/superpowers/specs/2026-10-04-email-import-design.md
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export const DAILY_EMAIL_IMPORTS = 25;
export const MAX_BOOKINGS_PER_EMAIL = 6;
export const IMPORT_LOG_KEEP = 50;
export type ImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';

export function sign(body: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function signatureValid(body: Buffer, header: string | undefined, secret: string): boolean {
  if (!secret || !header || !/^[0-9a-f]{64}$/.test(header)) return false;
  const want = Buffer.from(sign(body, secret), 'hex');
  const got = Buffer.from(header, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newToken(random: (n: number) => Buffer = randomBytes): string {
  // 252 is the largest multiple of 36 under 256: rejecting above it keeps every character equally likely.
  let out = '';
  while (out.length < 10) {
    for (const b of random(16)) {
      if (b < 252 && out.length < 10) out += ALPHABET[b % 36];
    }
  }
  return out;
}

export function tokenFromAddress(to: string): string | null {
  const m = /<?([^<>\s@]+)@([^<>\s@]+)>?\s*$/.exec(to.trim());
  if (!m || m[2].toLowerCase() !== IMPORT_DOMAIN) return null;
  const local = m[1].toLowerCase().split('+')[0];
  return /^[a-z0-9]{10}$/.test(local) ? local : null;
}

const BOOKING_WORDS = /confirm|itinerar|booking|booked|reservation|e-?ticket|boarding pass|check-?in|flight|hotel|\bpnr\b|record locator|your trip|receipt/i;
export function looksLikeBooking(subject: string, text: string, hasPdf: boolean): boolean {
  return hasPdf || BOOKING_WORDS.test(subject) || BOOKING_WORDS.test(text.slice(0, 20_000));
}

export function gmailConfirmation(from: string, subject: string, text: string): string | null {
  if (!/@google\.com>?\s*$/i.test(from.trim()) || !/forwarding confirmation/i.test(subject)) return null;
  const m = /\b(\d{6,9})\b/.exec(subject) ?? /\b(\d{6,9})\b/.exec(text);
  return m ? m[1] : null;
}

export function importGate(a: { paid: boolean; consent: boolean; usedToday: number; looksLikeBooking: boolean }): ImportStatus | 'parse' {
  if (!a.paid) return 'needs_pro';
  if (!a.consent) return 'needs_consent';
  if (a.usedToday >= DAILY_EMAIL_IMPORTS) return 'daily_limit';
  if (!a.looksLikeBooking) return 'not_booking';
  return 'parse';
}

export function dailyKey(now: Date): string {
  return `email_imports_${now.toISOString().slice(0, 10)}`;
}

export type WalletDoc = { collection: 'boarding_passes' | 'reservations'; data: Record<string, unknown>; title: string };

const RES_TYPES = new Set(['hotel', 'airbnb', 'rental_car', 'restaurant', 'activity', 'show']);
const ISO2 = /^[A-Za-z]{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function bookingsFromParse(parsed: unknown, ctx: { uid: string; emailImportId: string; nowIso: string }): WalletDoc[] {
  const list = (parsed as { bookings?: unknown } | null)?.bookings;
  if (!Array.isArray(list)) return [];
  const out: WalletDoc[] = [];
  for (const b of list) {
    if (out.length >= MAX_BOOKINGS_PER_EMAIL) break;
    const f = ((b as { fields?: unknown })?.fields ?? {}) as Record<string, unknown>;
    const base = { ownerUid: ctx.uid, source: 'email', emailImportId: ctx.emailImportId, createdAt: ctx.nowIso };
    if ((b as { kind?: unknown })?.kind === 'boarding_pass') {
      const flightNumber = str(f.flightNumber)?.toUpperCase();
      const origin = str(f.origin)?.toUpperCase();
      const destination = str(f.destination)?.toUpperCase();
      const departureTime = str(f.departureTime);
      if (!flightNumber || !origin || !destination || !departureTime || Number.isNaN(new Date(departureTime).getTime())) continue;
      const country = str(f.destinationCountryCode);
      const originCountry = str(f.originCountryCode);
      const localDate = str(f.departureLocalDate);
      out.push({ collection: 'boarding_passes', title: flightNumber, data: clean({
        ...base, airline: str(f.airline) ?? '', flightNumber, origin, originCity: str(f.originCity) ?? '',
        destination, destinationCity: str(f.destinationCity) ?? '', departureTime, arrivalTime: str(f.arrivalTime),
        seat: str(f.seat), boardingGroup: str(f.boardingGroup), gate: str(f.gate), terminal: str(f.terminal),
        status: 'upcoming', placeCity: str(f.destinationCity),
        placeCountryCode: country && ISO2.test(country) ? country.toUpperCase() : undefined,
        originCountryCode: originCountry && ISO2.test(originCountry) ? originCountry.toUpperCase() : undefined,
        localDate: localDate && DAY.test(localDate) ? localDate : undefined,
      }) });
    } else if ((b as { kind?: unknown })?.kind === 'reservation') {
      const title = str(f.title);
      if (!title) continue;
      const rawType = str((b as { reservationType?: unknown }).reservationType);
      const day = (v: unknown) => { const s = str(v); return s && DAY.test(s) ? s : undefined; };
      const country = str(f.countryCode);
      out.push({ collection: 'reservations', title, data: clean({
        ...base, type: rawType && RES_TYPES.has(rawType) ? rawType : 'activity', title,
        confirmationCode: str(f.confirmationCode) ?? '', checkIn: day(f.checkIn), checkOut: day(f.checkOut),
        address: str(f.address), notes: str(f.notes), placeCity: str(f.city),
        placeCountryCode: country && ISO2.test(country) ? country.toUpperCase() : undefined,
      }) });
    }
  }
  return out;
}

export function emailPushCopy(items: { title: string }[], linkedTrip: string | null, asked: boolean): { title: string; body: string } {
  if (items.length > 1) return { title: `Added ${items.length} bookings to your wallet`, body: linkedTrip ?? 'Tap to see them' };
  const name = items[0]?.title ?? 'A booking';
  if (linkedTrip) return { title: 'Added to your wallet', body: `${name} · ${linkedTrip}` };
  if (asked) return { title: 'Is this for a trip?', body: `${name} — tap to choose` };
  return { title: 'Added to your wallet', body: name };
}

export function trimImportLog(rows: { id: string; receivedAt: number }[], keep = IMPORT_LOG_KEEP): string[] {
  return [...rows].sort((a, b) => b.receivedAt - a.receivedAt).slice(keep).map((r) => r.id);
}
