/**
 * Email import's rules (Part 2 of the premium wallet). Pure — no
 * firebase-admin, no mailparser — so it is unit-tested; inboundEmail
 * (emailImportFunctions.ts) does the I/O. Spec: docs/superpowers/specs/2026-10-04-email-import-design.md
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

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

const GOOGLE_CONFIRM_HOSTS = new Set(['mail-settings.google.com', 'mail.google.com']);

/**
 * The link in Gmail's forwarding confirmation. Gmail now confirms forwarding
 * only by this link (the settings page has no code box any more). Only an
 * https link on Google's own hosts is accepted — the app shows it as a
 * button, so a forged "confirmation" must not be able to plant another.
 */
export function gmailConfirmationLink(text: string): string | null {
  for (const raw of text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && GOOGLE_CONFIRM_HOSTS.has(u.hostname) && /\/mail\/vf-/.test(u.pathname)) return raw;
    } catch {
      // not a URL
    }
  }
  return null;
}

export function importGate(a: { paid: boolean; consent: boolean; usedToday: number; looksLikeBooking: boolean }): ImportStatus | 'parse' {
  if (!a.paid) return 'needs_pro';
  if (!a.consent) return 'needs_consent';
  if (a.usedToday >= DAILY_EMAIL_IMPORTS) return 'daily_limit';
  if (!a.looksLikeBooking) return 'not_booking';
  return 'parse';
}

/**
 * One import per message per person: a redelivery, a filter plus a manual
 * forward, or an airline re-sending the same confirmation all land on the
 * same id, which inboundEmail claims with create() before doing anything.
 * Falls back to the raw message when it has no Message-ID.
 */
export function importIdFor(uid: string, messageId: string | undefined, raw: Buffer): string {
  const key = messageId?.trim() ? `mid:${messageId.trim()}` : `raw:${createHash('sha256').update(raw).digest('hex')}`;
  return createHash('sha256').update(`${uid}\n${key}`).digest('hex').slice(0, 40);
}

export function dailyKey(now: Date): string {
  return `email_imports_${now.toISOString().slice(0, 10)}`;
}

export type WalletDoc = { collection: 'boarding_passes' | 'reservations'; data: Record<string, unknown>; title: string };

const RES_TYPES = new Set(['hotel', 'airbnb', 'rental_car', 'restaurant', 'activity', 'show', 'transit']);
const TRANSIT_MODES = new Set(['train', 'bus', 'ferry']);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO2 = /^[A-Za-z]{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A train/bus/ferry ticket's route and times — times as printed ("09:19"), never converted. */
function transitFields(type: string | undefined, f: Record<string, unknown>): Record<string, unknown> {
  if (type !== 'transit') return {};
  const time = (v: unknown) => { const s = str(v); return s && HHMM.test(s) ? s : undefined; };
  const mode = str(f.transitMode)?.toLowerCase();
  const originCountry = str(f.originCountryCode);
  return {
    transitMode: mode && TRANSIT_MODES.has(mode) ? mode : 'train',
    operator: str(f.operator, 100),
    fromPlace: str(f.fromPlace),
    toPlace: str(f.toPlace),
    departureLocalTime: time(f.departureLocalTime),
    arrivalLocalTime: time(f.arrivalLocalTime),
    seat: str(f.seat, 100),
    originCity: str(f.originCity),
    originCountryCode: originCountry && ISO2.test(originCountry) ? originCountry.toUpperCase() : undefined,
  };
}

/**
 * The paste import's answer as an older app can draw it: "transit" becomes an
 * activity with a transitMode (which 1.0.3+ reads back as a train/bus/ferry).
 */
export function forOlderApps<T extends { kind?: unknown; reservationType?: unknown; fields?: Record<string, unknown> }>(parsed: T): T {
  if (parsed?.kind !== 'reservation' || parsed.reservationType !== 'transit') return parsed;
  const mode = typeof parsed.fields?.transitMode === 'string' && TRANSIT_MODES.has(parsed.fields.transitMode.toLowerCase())
    ? parsed.fields.transitMode.toLowerCase() : 'train';
  return { ...parsed, reservationType: 'activity', fields: { ...(parsed.fields ?? {}), transitMode: mode } };
}

export function bookingsFromParse(parsed: unknown, ctx: { uid: string; emailImportId: string; nowIso: string }): WalletDoc[] {
  // A single booking returned without the list (the base prompt's own shape) still counts.
  const p = parsed as { bookings?: unknown; kind?: unknown } | null;
  const list = Array.isArray(p?.bookings) ? p!.bookings as unknown[] : p && typeof p.kind === 'string' ? [p] : null;
  if (!list) return [];
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
      // A title alone is a newsletter ("Paris hotel deals"), not a booking.
      const checkInDay = str(f.checkIn);
      if (!title || !(str(f.confirmationCode) || (checkInDay && DAY.test(checkInDay)) || str(f.address))) continue;
      const rawType = str((b as { reservationType?: unknown }).reservationType);
      const day = (v: unknown) => { const s = str(v); return s && DAY.test(s) ? s : undefined; };
      const country = str(f.countryCode);
      out.push({ collection: 'reservations', title, data: clean({
        // A transit ticket is stored as an activity + transitMode: apps before 1.0.3
        // look up an icon by type and crash on one they don't know.
        ...base, type: rawType && RES_TYPES.has(rawType) && rawType !== 'transit' ? rawType : 'activity', title,
        confirmationCode: str(f.confirmationCode, 100) ?? '', checkIn: day(f.checkIn), checkOut: day(f.checkOut),
        address: str(f.address, 500), notes: str(f.notes, 2000), placeCity: str(f.city),
        // A table or ticket time as printed ("19:30"); fills the matching stop's time (utils/stopTime.ts).
        time: typeof f.time === 'string' && HHMM.test(f.time) ? f.time : undefined,
        placeCountryCode: country && ISO2.test(country) ? country.toUpperCase() : undefined,
        ...transitFields(rawType, f),
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
