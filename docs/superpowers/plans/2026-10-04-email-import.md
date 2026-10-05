# Email Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro users get a personal `{token}@supernovatravel.xyz` address; confirmation emails sent to it become wallet bookings, matched to trips, with a push and an import log.

**Architecture:** Cloudflare Email Routing (catch-all) → a Cloudflare Email Worker that signs and POSTs the raw MIME → Firebase `inboundEmail` (onRequest) which verifies, gates (Pro, consent, daily cap, keyword filter), parses with Gemini (list prompt, PDFs inline), saves bookings, runs Part 1's `matchOne`, logs to `users/{uid}/emailImports`, and pushes. Two callables create/rotate the address. Pure logic in `functions/src/emailImport.ts` and `utils/emailImport.ts`.

**Tech Stack:** Cloudflare Workers (wrangler 4, Email Workers, WebCrypto), Firebase Functions v2 (`onRequest`, `onCall`), `mailparser`, Gemini 2.5 Flash, Expo Router, TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-10-04-email-import-design.md`

## Global Constraints

- Domain `supernovatravel.xyz`; address `{token}@supernovatravel.xyz`; token = 10 chars of `a-z0-9`.
- Pro only (`tier` `pro`/`business`); AI consent (`hasAiConsent`) before anything reaches Gemini.
- At most 25 email imports per user per UTC day (`usage_quotas/{uid}.email_imports_YYYY-MM-DD`); at most 6 bookings per email; at most 2 PDFs ≤ 5 MB each; raw email > 10 MB dropped by the Worker.
- Never bounce; unknown addresses and bad signatures get no user-visible trace. The email body is never stored.
- `inboundEmail` always answers 200 after a valid signature (Cloudflare must not retry into duplicates); `maxInstances: 5`, `timeoutSeconds: 120`.
- Secret: one random 32-byte hex value, `INBOUND_EMAIL_SECRET` in `functions/.env` (git-ignored, the pattern `GEMINI_API_KEY` uses) and `INBOUND_SECRET` as a wrangler secret. Never print or commit it.
- Notification types are added to **both** `utils/notificationRoute.ts` and `functions/src/pushData.ts`.
- Design rules: no emoji, one primary action, every empty state icon + title + description + action, Light/Medium haptics, 44pt, `useTheme()` colours, sentence case, eyebrows.

## Review Focus

1. **A forged POST straight to the function** (no Worker) must create nothing — signature check before any read. → `signatureValid` tests (Task 1) + a live unsigned POST (Task 3).
2. **The same email delivered twice** (Cloudflare retry after a timeout) — at worst two log rows; never a crash or a half-written booking. → `inboundEmail` writes bookings in one batch with the log row (Task 2).
3. **A newsletter that says "book now"** passes the keyword filter and costs one AI call, then logs "Not a booking" — never creates an empty booking. → `bookingsFromParse` drops entries without their required fields (Task 1).
4. **A user who rotates their address** must stop receiving on the old one at once. → `rotateImportAddress` deletes the old `inboundAddresses` doc before writing the new (Task 2) + live check (Task 3).
5. **An old app build tapping an `email_import_*` push** must not crash. → route tests: unknown/missing id → null (Task 2).

---

### Task 1: Server email rules (pure)

**Files:**
- Create: `functions/src/emailImport.ts`
- Test: `__tests__/functions/emailImport.test.ts`

**Interfaces — Produces:**
```ts
export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export const DAILY_EMAIL_IMPORTS = 25;
export const MAX_BOOKINGS_PER_EMAIL = 6;
export const IMPORT_LOG_KEEP = 50;
export type ImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';
export function signatureValid(body: Buffer, header: string | undefined, secret: string): boolean;
export function sign(body: Buffer, secret: string): string;           // hex HMAC-SHA256 (tests + Worker parity)
export function newToken(random?: (n: number) => Buffer): string;      // 10 × [a-z0-9]
export function tokenFromAddress(to: string): string | null;
export function looksLikeBooking(subject: string, text: string, hasPdf: boolean): boolean;
export function gmailConfirmation(from: string, subject: string, text: string): string | null;  // the code
export function importGate(a: { paid: boolean; consent: boolean; usedToday: number; looksLikeBooking: boolean }): ImportStatus | 'parse';
export function dailyKey(now: Date): string;                           // email_imports_YYYY-MM-DD (UTC)
export type WalletDoc = { collection: 'boarding_passes' | 'reservations'; data: Record<string, unknown>; title: string };
export function bookingsFromParse(parsed: unknown, ctx: { uid: string; emailImportId: string; nowIso: string }): WalletDoc[];
export function emailPushCopy(items: { title: string }[], linkedTrip: string | null, asked: boolean):
  { title: string; body: string };
export function trimImportLog(ids: { id: string; receivedAt: number }[], keep?: number): string[];  // ids to delete
```

- [ ] **Step 1: Failing tests**

```ts
import {
  signatureValid, sign, newToken, tokenFromAddress, looksLikeBooking, gmailConfirmation, importGate,
  dailyKey, bookingsFromParse, emailPushCopy, trimImportLog,
} from '../../functions/src/emailImport';

describe('signatureValid', () => {
  const body = Buffer.from('{"to":"a@supernovatravel.xyz"}');
  it('accepts the Worker signature and rejects anything else', () => {
    expect(signatureValid(body, sign(body, 's3cret'), 's3cret')).toBe(true);
    expect(signatureValid(Buffer.from('{"to":"b"}'), sign(body, 's3cret'), 's3cret')).toBe(false);
    expect(signatureValid(body, sign(body, 'other'), 's3cret')).toBe(false);
    expect(signatureValid(body, undefined, 's3cret')).toBe(false);
    expect(signatureValid(body, 'zz', 's3cret')).toBe(false);
    expect(signatureValid(body, sign(body, ''), '')).toBe(false); // no secret configured: refuse
  });
});

describe('tokens and addresses', () => {
  it('makes 10-character a-z0-9 tokens', () => {
    const t = newToken();
    expect(t).toMatch(/^[a-z0-9]{10}$/);
    expect(newToken()).not.toBe(t);
  });
  it('reads the token from our domain only, ignoring case and +tags', () => {
    expect(tokenFromAddress('K7X2M9QPZ4@SupernovaTravel.xyz')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('k7x2m9qpz4+gmail@supernovatravel.xyz')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('Name <k7x2m9qpz4@supernovatravel.xyz>')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('k7x2m9qpz4@evil.xyz')).toBeNull();
    expect(tokenFromAddress('short@supernovatravel.xyz')).toBeNull();
    expect(tokenFromAddress('')).toBeNull();
  });
});

describe('looksLikeBooking', () => {
  it('lets confirmations through and keeps plainly unrelated mail out', () => {
    expect(looksLikeBooking('Your booking confirmation – Hotel Artemide', '', false)).toBe(true);
    expect(looksLikeBooking('Fwd: trip', 'Record locator: XK7P2Q', false)).toBe(true);
    expect(looksLikeBooking('Hello', 'see attached', true)).toBe(true);
    expect(looksLikeBooking('Weekly newsletter', 'Our favourite recipes', false)).toBe(false);
  });
});

describe('gmailConfirmation', () => {
  const body = `mark@example.com has requested to automatically forward mail to your email
address k7x2m9qpz4@supernovatravel.xyz.
Confirmation code: 123456789
To allow mark@example.com to automatically forward mail to your address, please click the link below`;
  it('pulls the code from Gmail\'s forwarding confirmation', () => {
    expect(gmailConfirmation('Gmail Team <forwarding-noreply@google.com>', '(#123456789) Gmail Forwarding Confirmation - Receive Mail from mark@example.com', body))
      .toBe('123456789');
  });
  it('ignores anything not from Google', () => {
    expect(gmailConfirmation('x@phish.com', 'Gmail Forwarding Confirmation', body)).toBeNull();
    expect(gmailConfirmation('forwarding-noreply@google.com', 'Something else', body)).toBeNull();
  });
});

describe('importGate', () => {
  const ok = { paid: true, consent: true, usedToday: 0, looksLikeBooking: true };
  it('checks Pro, then consent, then the daily cap, then the keyword filter', () => {
    expect(importGate(ok)).toBe('parse');
    expect(importGate({ ...ok, paid: false, consent: false })).toBe('needs_pro');
    expect(importGate({ ...ok, consent: false, usedToday: 99 })).toBe('needs_consent');
    expect(importGate({ ...ok, usedToday: 25, looksLikeBooking: false })).toBe('daily_limit');
    expect(importGate({ ...ok, looksLikeBooking: false })).toBe('not_booking');
  });
  it('the daily key is the UTC day', () => {
    expect(dailyKey(new Date('2026-10-04T23:30:00-07:00'))).toBe('email_imports_2026-10-05');
  });
});

describe('bookingsFromParse', () => {
  const ctx = { uid: 'u1', emailImportId: 'e1', nowIso: '2026-10-04T00:00:00.000Z' };
  it('maps each booking to its wallet document, with place fields', () => {
    const docs = bookingsFromParse({ bookings: [
      { kind: 'boarding_pass', fields: { airline: 'American', flightNumber: 'aa104', origin: 'jfk', destination: 'fco',
        destinationCity: 'Rome', destinationCountryCode: 'it', departureTime: '2026-07-25T12:10:00Z', departureLocalDate: '2026-07-25', seat: '14A' } },
      { kind: 'reservation', reservationType: 'hotel', fields: { title: 'Hotel Artemide', confirmationCode: '88213',
        checkIn: '2026-07-25', checkOut: '2026-07-28', city: 'Roma', countryCode: 'IT' } },
    ] }, ctx);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({ collection: 'boarding_passes', title: 'AA104', data: expect.objectContaining({
      ownerUid: 'u1', source: 'email', emailImportId: 'e1', airline: 'American', flightNumber: 'AA104', origin: 'JFK',
      destination: 'FCO', status: 'upcoming', createdAt: ctx.nowIso, placeCity: 'Rome', placeCountryCode: 'IT',
      localDate: '2026-07-25', seat: '14A' }) });
    expect(docs[1]).toEqual({ collection: 'reservations', title: 'Hotel Artemide', data: expect.objectContaining({
      ownerUid: 'u1', source: 'email', type: 'hotel', title: 'Hotel Artemide', confirmationCode: '88213',
      checkIn: '2026-07-25', checkOut: '2026-07-28', placeCity: 'Roma', placeCountryCode: 'IT' }) });
  });
  it('drops entries missing what makes them a booking, and caps at 6', () => {
    expect(bookingsFromParse({ bookings: [{ kind: 'boarding_pass', fields: { airline: 'X' } }] }, ctx)).toEqual([]);
    expect(bookingsFromParse({ bookings: [{ kind: 'reservation', reservationType: 'activity', fields: {} }] }, ctx)).toEqual([]);
    expect(bookingsFromParse({ bookings: 'nope' }, ctx)).toEqual([]);
    expect(bookingsFromParse(null, ctx)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'reservation', reservationType: 'restaurant', fields: { title: `R${i}` } }));
    expect(bookingsFromParse({ bookings: many }, ctx)).toHaveLength(6);
  });
  it('an unknown reservation type becomes an activity; a date that is not a date is dropped', () => {
    const [d] = bookingsFromParse({ bookings: [{ kind: 'reservation', reservationType: 'spa', fields: { title: 'Spa', checkIn: 'soon' } }] }, ctx);
    expect(d.data.type).toBe('activity');
    expect(d.data.checkIn).toBeUndefined();
  });
});

describe('emailPushCopy', () => {
  it('reads naturally for each outcome', () => {
    expect(emailPushCopy([{ title: 'AA104' }], 'Rome in Spring', false))
      .toEqual({ title: 'Added to your wallet', body: 'AA104 · Rome in Spring' });
    expect(emailPushCopy([{ title: 'Hotel Artemide' }], null, true))
      .toEqual({ title: 'Is this for a trip?', body: 'Hotel Artemide — tap to choose' });
    expect(emailPushCopy([{ title: 'Hotel Artemide' }], null, false))
      .toEqual({ title: 'Added to your wallet', body: 'Hotel Artemide' });
    expect(emailPushCopy([{ title: 'A' }, { title: 'B' }], 'Rome in Spring', false))
      .toEqual({ title: 'Added 2 bookings to your wallet', body: 'Rome in Spring' });
  });
});

describe('trimImportLog', () => {
  it('keeps the newest entries', () => {
    const rows = Array.from({ length: 53 }, (_, i) => ({ id: `r${i}`, receivedAt: i }));
    expect(trimImportLog(rows).sort()).toEqual(['r0', 'r1', 'r2']);
    expect(trimImportLog(rows.slice(0, 10))).toEqual([]);
  });
});
```

Run: `npx jest __tests__/functions/emailImport.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement `functions/src/emailImport.ts`**

```ts
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
```

Run: `npx jest __tests__/functions/emailImport.test.ts` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add functions/src/emailImport.ts __tests__/functions/emailImport.test.ts
git commit -m "feat: email import rules (pure)"
```

---

### Task 2: Server — inboundEmail, address callables, push types, rules, account deletion

**Files:**
- Create: `functions/src/emailImportFunctions.ts`
- Modify: `functions/src/parseTravelConfirmation.ts` (export `buildExtractionPrompt`), `functions/src/bookingMatchFunctions.ts` (export `matchOne` — already exported; verify), `functions/src/index.ts`, `functions/src/pushData.ts` (`ID_KEYS` + `reservationId`, `emailImportId`), `utils/notificationRoute.ts`, `functions/src/deleteAccount.ts`, `firestore.rules`, `functions/package.json` (`mailparser`, `@types/mailparser`), `functions/.env` (`INBOUND_EMAIL_SECRET`), `app/notifications.tsx` (rows)
- Test: `__tests__/utils/notificationRoute.test.ts` (extend), `__tests__/functions/pushData.test.ts` (extend if it exists; else add cases to the route test)

**Interfaces:**
- Consumes: Task 1 everything; `matchOne(uid, kind, id)` from `bookingMatchFunctions.ts`; `hasAiConsent`; `notifyUser`.
- Produces: `inboundEmail` (onRequest), `createImportAddress()` / `rotateImportAddress()` callables → `{ address: string }`. Notification types `email_import_pass` (`passId`), `email_import_reservation` (`reservationId`), `email_import_batch` (`emailImportId`) — three types, not the spec's one `email_import`, because the route table maps one type to one id key.

- [ ] **Step 1: Failing route tests** (append to the notification-route test file; find it with `ls __tests__/utils | grep -i notification`)

```ts
describe('email import routes', () => {
  it('a single imported booking opens it; several open the email import screen', () => {
    expect(resolveNotificationRoute({ type: 'email_import_pass', passId: 'p1' })).toBe('/(wallet)/boarding-pass/p1');
    expect(resolveNotificationRoute({ type: 'email_import_reservation', reservationId: 'r1' })).toBe('/(wallet)/reservation/r1');
    expect(resolveNotificationRoute({ type: 'email_import_batch', emailImportId: 'e1' })).toBe('/(wallet)/email-import');
  });
  it('a missing id is null, not a crash', () => {
    expect(resolveNotificationRoute({ type: 'email_import_reservation' })).toBeNull();
  });
});
```
and, in the pushData test (`__tests__/functions/pushData.test.ts`):
```ts
it('carries the email import ids', () => {
  expect(pushDataFor({ type: 'email_import_reservation', reservationId: 'r1', body: 'long text' }))
    .toEqual({ type: 'email_import_reservation', reservationId: 'r1' });
  expect(pushDataFor({ type: 'email_import_batch', emailImportId: 'e1' })).toEqual({ type: 'email_import_batch', emailImportId: 'e1' });
});
```
Run both → Expected: FAIL.

- [ ] **Step 2: Routes and push keys**

`utils/notificationRoute.ts` `ROUTES` add:
```ts
  email_import_pass: { idKey: 'passId', build: (id) => `/(wallet)/boarding-pass/${id}` },
  email_import_reservation: { idKey: 'reservationId', build: (id) => `/(wallet)/reservation/${id}` },
  email_import_batch: { idKey: 'emailImportId', build: () => '/(wallet)/email-import' },
```
`functions/src/pushData.ts`: `const ID_KEYS = ['postId', 'tripId', 'threadId', 'passId', 'profileUid', 'reservationId', 'emailImportId'] as const;`
Run tests → Expected: PASS.

- [ ] **Step 3: Dependencies and secret**

```bash
cd functions && npm install mailparser@^3 && npm install -D @types/mailparser && cd ..
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > /tmp/inbound_secret   # never echo it
printf 'INBOUND_EMAIL_SECRET=%s\n' "$(cat /tmp/inbound_secret)" >> functions/.env
```
(Keep `/tmp/inbound_secret` for Task 3's wrangler secret, then delete it.)

- [ ] **Step 4: Export the prompt** — in `functions/src/parseTravelConfirmation.ts` change `function buildExtractionPrompt()` to `export function buildExtractionPrompt()`.

- [ ] **Step 5: `functions/src/emailImportFunctions.ts`**

```ts
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { simpleParser } from 'mailparser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  IMPORT_DOMAIN, MAX_BOOKINGS_PER_EMAIL, bookingsFromParse, dailyKey, emailPushCopy, gmailConfirmation,
  importGate, looksLikeBooking, newToken, signatureValid, tokenFromAddress, trimImportLog, type ImportStatus,
} from './emailImport';
import { buildExtractionPrompt } from './parseTravelConfirmation';
import { matchOne } from './bookingMatchFunctions';
import { hasAiConsent } from './aiConsent';
import { notifyUser } from './notify';

const db = admin.firestore();
const PDF_MAX = 5 * 1024 * 1024;

const isPaid = (u: Record<string, unknown> | undefined) => u?.tier === 'pro' || u?.tier === 'business';

async function log(uid: string, id: string, status: ImportStatus, subject: string, extra: Record<string, unknown> = {}) {
  const col = db.collection('users').doc(uid).collection('emailImports');
  await col.doc(id).set({ receivedAt: admin.firestore.FieldValue.serverTimestamp(), subject: subject.slice(0, 140), status, items: [], ...extra });
  const rows = await col.orderBy('receivedAt', 'desc').get();
  const stale = trimImportLog(rows.docs.map((d) => ({ id: d.id, receivedAt: d.data().receivedAt?.toMillis?.() ?? Date.now() })));
  await Promise.all(stale.map((s) => col.doc(s).delete()));
}

function emailPrompt(): string {
  return `${buildExtractionPrompt()}

This is a forwarded email and may hold several bookings (for example an outbound and a return flight, or a
hotel and a car). Return {"bookings": [ ... ]} where each entry is one object in exactly one of the two
formats above. At most ${MAX_BOOKINGS_PER_EMAIL}. If there is no booking at all, return {"bookings": []}.`;
}

/** Cloudflare's Email Worker posts every message for @supernovatravel.xyz here (cloudflare/email-inbound). */
export const inboundEmail = onRequest({ region: 'us-central1', maxInstances: 5, timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  const raw = req.rawBody;
  if (req.method !== 'POST' || !raw || !signatureValid(raw, req.get('X-Supernova-Signature'), process.env.INBOUND_EMAIL_SECRET ?? '')) {
    res.status(401).send('');
    return;
  }
  // From here on always 200: a retry would import twice.
  let uid: string | null = null;
  const importId = db.collection('_').doc().id;
  let subject = '';
  try {
    const { to, raw: mime } = req.body as { to?: string; raw?: string };
    const token = tokenFromAddress(to ?? '');
    const addr = token ? await db.doc(`inboundAddresses/${token}`).get() : null;
    if (!addr?.exists) { res.status(200).send(''); return; }
    uid = addr.data()!.uid as string;

    const mail = await simpleParser(Buffer.from(mime ?? '', 'base64'));
    subject = mail.subject ?? '';
    const from = mail.from?.text ?? '';
    const text = (mail.text ?? (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '')).slice(0, 60_000);
    const pdfs = mail.attachments.filter((a) => a.contentType === 'application/pdf' && a.size <= PDF_MAX).slice(0, 2);

    const code = gmailConfirmation(from, subject, text);
    if (code) {
      await db.doc(`users/${uid}`).set({ gmailForwardingCode: { code, at: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
      await log(uid, importId, 'gmail_confirmation', subject);
      res.status(200).send('');
      return;
    }

    const user = (await db.doc(`users/${uid}`).get()).data();
    const key = dailyKey(new Date());
    const usedToday = ((await db.doc(`usage_quotas/${uid}`).get()).data() ?? {})[key] ?? 0;
    const gate = importGate({ paid: isPaid(user), consent: hasAiConsent(user), usedToday, looksLikeBooking: looksLikeBooking(subject, text, pdfs.length > 0) });
    if (gate !== 'parse') { await log(uid, importId, gate, subject); res.status(200).send(''); return; }

    await db.doc(`usage_quotas/${uid}`).set({ [key]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '').getGenerativeModel({ model: 'gemini-2.5-flash' });
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
      { text: emailPrompt() },
      { text: `Subject: ${subject}\n\n${text}` },
      ...pdfs.map((p) => ({ inlineData: { mimeType: 'application/pdf', data: p.content.toString('base64') } })),
    ];
    const out = (await model.generateContent(parts)).response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(out.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim()); } catch { parsed = null; }
    const docs = bookingsFromParse(parsed, { uid, emailImportId: importId, nowIso: new Date().toISOString() });
    if (docs.length === 0) { await log(uid, importId, 'unreadable', subject); res.status(200).send(''); return; }

    // One batch: either every booking from this email is saved, or none is.
    const batch = db.batch();
    const refs = docs.map((d) => { const ref = db.collection(d.collection).doc(); batch.set(ref, d.data); return { ref, d }; });
    await batch.commit();

    let linkedTrip: string | null = null;
    let asked = false;
    for (const { ref, d } of refs) {
      const r = await matchOne(uid, d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', ref.id);
      if (r.kind === 'link') linkedTrip = linkedTrip ?? r.trip.title;
      if (r.kind === 'ask') asked = true;
    }
    const items = refs.map(({ ref, d }) => ({ kind: d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', id: ref.id, title: d.title }));
    await log(uid, importId, 'imported', subject, { items, ...(linkedTrip ? { tripTitle: linkedTrip } : {}) });

    const copy = emailPushCopy(items, linkedTrip, asked);
    const single = items.length === 1 ? items[0] : null;
    await notifyUser(uid, {
      notification: single
        ? (single.kind === 'boarding_pass'
          ? { type: 'email_import_pass', passId: single.id, title: copy.title, body: copy.body }
          : { type: 'email_import_reservation', reservationId: single.id, title: copy.title, body: copy.body })
        : { type: 'email_import_batch', emailImportId: importId, title: copy.title, body: copy.body },
      push: copy,
    });
    res.status(200).send('');
  } catch (err) {
    console.error('inboundEmail failed', err);
    if (uid) await log(uid, importId, 'unreadable', subject).catch(() => undefined);
    res.status(200).send('');
  }
});

async function requireProUser(uid: string) {
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (!isPaid(user)) throw new HttpsError('permission-denied', 'Email import is a Pro feature.');
  return user;
}

async function issueAddress(uid: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = newToken();
    const ref = db.doc(`inboundAddresses/${token}`);
    try {
      await ref.create({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.doc(`users/${uid}`).set({ importAddress: { token, createdAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
      return `${token}@${IMPORT_DOMAIN}`;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS → try another token
    }
  }
  throw new HttpsError('internal', 'Could not create an address. Try again.');
}

export const createImportAddress = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const user = await requireProUser(request.auth.uid);
  if (!hasAiConsent(user)) throw new HttpsError('failed-precondition', 'Allow AI import first.');
  const existing = user?.importAddress?.token;
  if (typeof existing === 'string') return { address: `${existing}@${IMPORT_DOMAIN}` };
  return { address: await issueAddress(request.auth.uid) };
});

export const rotateImportAddress = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const uid = request.auth.uid;
  const user = await requireProUser(uid);
  const old = user?.importAddress?.token;
  // The old address stops working before the new one exists.
  if (typeof old === 'string') await db.doc(`inboundAddresses/${old}`).delete();
  await db.doc(`users/${uid}`).set({ gmailForwardingCode: admin.firestore.FieldValue.delete() }, { merge: true });
  return { address: await issueAddress(uid) };
});
```

`functions/src/index.ts`: `export { inboundEmail, createImportAddress, rotateImportAddress } from './emailImportFunctions';`

- [ ] **Step 6: Rules, account deletion, in-app rows**

`firestore.rules`, inside `match /users/{uid}` (next to the other owner subcollections):
```
      // Email import log (emailImportFunctions.ts): written by the server only.
      match /emailImports/{importId} {
        allow read, delete: if isAuthed() && request.auth.uid == uid;
      }
```
(`inboundAddresses` gets no rule: server only.) Check that the `users/{uid}` update rule does not let a client write `importAddress` or `gmailForwardingCode` — if the owner update rule allows any field, add them to its forbidden keys alongside `tier`.

`functions/src/deleteAccount.ts`, before the final `recursiveDelete(users/{uid})`:
```ts
  // Email import address (emailImportFunctions.ts); the log goes with users/{uid}.
  const importToken = (await db.doc(`users/${uid}`).get()).data()?.importAddress?.token;
  if (typeof importToken === 'string') await db.doc(`inboundAddresses/${importToken}`).delete();
```

`app/notifications.tsx`: a row for the three `email_import_*` types, modelled on the `flight_status` row: `Envelope` icon (`colors.text.secondary`, sunken bubble), bold `item.title`, then `item.body`, time.

- [ ] **Step 7: Build, test, deploy, commit**

Run: `cd functions && npm run build` → no errors. `npx jest` → all pass. `npx firebase deploy --only firestore:rules --dry-run` → complete.
Deploy: `npx firebase deploy --only firestore:rules,functions:inboundEmail,functions:createImportAddress,functions:rotateImportAddress`
Expected: each `✔ … Successful`.
Live: `curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"to":"x"}' https://us-central1-supernova-a2125.cloudfunctions.net/inboundEmail` → `401`.

```bash
git add functions utils/notificationRoute.ts __tests__ firestore.rules app/notifications.tsx
git commit -m "feat: inboundEmail, import address callables, email_import notifications"
```

---

### Task 3: Cloudflare Worker and routing

**Files:**
- Create: `cloudflare/email-inbound/wrangler.toml`, `cloudflare/email-inbound/src/index.ts`, `cloudflare/email-inbound/src/sign.ts`, `cloudflare/email-inbound/package.json`, `cloudflare/email-inbound/tsconfig.json`
- Test: `__tests__/cloudflare/sign.test.ts`

**Interfaces:** Consumes Task 1's `sign` (parity test). Produces the deployed Worker `supernova-email-inbound`.

- [ ] **Step 1: Failing parity test** — the Worker's WebCrypto signature must equal the function's.

```ts
import { signBody } from '../../cloudflare/email-inbound/src/sign';
import { sign } from '../../functions/src/emailImport';

it('the Worker signs exactly as inboundEmail verifies', async () => {
  const body = JSON.stringify({ to: 'k7x2m9qpz4@supernovatravel.xyz', from: 'a@b.c', raw: 'aGk=' });
  expect(await signBody(body, 's3cret')).toBe(sign(Buffer.from(body), 's3cret'));
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Worker code**

`cloudflare/email-inbound/src/sign.ts`:
```ts
/** hex HMAC-SHA256 of the request body — inboundEmail verifies the same (functions/src/emailImport.ts). */
export async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```
`cloudflare/email-inbound/src/index.ts`:
```ts
import { signBody } from './sign';

interface Env { INBOUND_SECRET: string; INBOUND_URL: string }
const MAX_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export default {
  /** Every email to @supernovatravel.xyz (Email Routing catch-all). Never bounces. */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_BYTES) return;
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const body = JSON.stringify({ to: message.to, from: message.from, raw: toBase64(raw) });
    await fetch(env.INBOUND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Supernova-Signature': await signBody(body, env.INBOUND_SECRET) },
      body,
    });
  },
};
```
`wrangler.toml`:
```toml
name = "supernova-email-inbound"
main = "src/index.ts"
compatibility_date = "2026-10-01"
[vars]
INBOUND_URL = "https://us-central1-supernova-a2125.cloudfunctions.net/inboundEmail"
```
`package.json`: `{ "name": "supernova-email-inbound", "private": true, "devDependencies": { "@cloudflare/workers-types": "^4" } }`; `tsconfig.json` with `"types": ["@cloudflare/workers-types"]`, `"lib": ["ES2022"]`, `"module": "ES2022"`, `"moduleResolution": "bundler"`, `"strict": true`.
Exclude `cloudflare/` from the app's `tsconfig.json` (`"exclude"`) so the app's `tsc` doesn't type-check Worker globals.

Run the parity test → PASS.

- [ ] **Step 3: Deploy, secret, routing**

```bash
cd cloudflare/email-inbound && npm install && npx wrangler deploy && \
  npx wrangler secret put INBOUND_SECRET < /tmp/inbound_secret && rm /tmp/inbound_secret && cd ../..
```
Expected: `Deployed supernova-email-inbound`, `Success! Uploaded secret INBOUND_SECRET`.
Routing — Email Routing → Routing rules → Catch-all → **Send to a Worker** → `supernova-email-inbound`, enabled. Try the API with wrangler's OAuth token first (`GET/PUT /zones/{zone}/email/routing/rules/catch_all`); if the token lacks Email Routing scope, ask the user to set it in the dashboard (one dropdown) and wait.

- [ ] **Step 4: Live checks**
- `dig +short MX supernovatravel.xyz` shows Cloudflare's `route*.mx.cloudflare.net` (if DNS hasn't propagated yet, note it and continue).
- Signed POST for an unknown token → 200 and nothing written (`node` script using `sign`, the secret from `functions/.env`).
- The real thing (needs the user): create an address (Task 4 app, or the callable as the user via a custom token), and ask the user to forward one real confirmation email to it; read `users/{uid}/emailImports` and the new wallet item.

```bash
git add cloudflare __tests__/cloudflare tsconfig.json
git commit -m "feat: Cloudflare email Worker for supernovatravel.xyz"
```

---

### Task 4: App — Email import screen, wallet entry, From email

**Files:**
- Create: `utils/emailImport.ts`, `hooks/useEmailImport.ts`, `app/(wallet)/email-import.tsx`, `components/wallet/EmailImportRow.tsx`
- Modify: `services/gemini.ts` (callables), `app/(wallet)/_layout.tsx` (screen), `app/(wallet)/index.tsx` (row), `app/(wallet)/boarding-pass/[id].tsx` + `app/(wallet)/reservation/[id].tsx` ("From email"), `types/index.ts` (`source?: 'email'` on both wallet types; `EmailImportEntry`)
- Test: `__tests__/utils/emailImport.test.ts`

**Interfaces — Produces:**
```ts
// utils/emailImport.ts
export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export type EmailImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';
export interface EmailImportEntry { id: string; receivedAt: Date | null; subject: string; status: EmailImportStatus;
  items: { kind: 'boarding_pass' | 'reservation'; id: string; title: string }[]; tripTitle?: string }
export function statusLine(e: EmailImportEntry): string;
export function gmailCodeFresh(at: Date | null, now: Date): boolean;     // < 24 h
export const GMAIL_FILTER: string;
export function addressFor(token: string | null | undefined): string | null;
// hooks/useEmailImport.ts
export function useEmailImport(): { address: string | null; gmailCode: string | null; entries: EmailImportEntry[];
  isLoading: boolean; create(): Promise<void>; rotate(): Promise<void>; busy: boolean; error: string | null };
// services/gemini.ts
export async function callCreateImportAddress(): Promise<{ address: string }>;
export async function callRotateImportAddress(): Promise<{ address: string }>;
```

- [ ] **Step 1: Failing tests**

```ts
import { statusLine, gmailCodeFresh, addressFor, GMAIL_FILTER, type EmailImportEntry } from '@/utils/emailImport';

const e = (over: Partial<EmailImportEntry>): EmailImportEntry =>
  ({ id: 'e', receivedAt: null, subject: 'S', status: 'imported', items: [], ...over });

describe('statusLine', () => {
  it('says what happened to each email', () => {
    expect(statusLine(e({ items: [{ kind: 'reservation', id: 'r', title: 'Hotel Artemide' }], tripTitle: 'Rome in Spring' })))
      .toBe('Added Hotel Artemide · Rome in Spring');
    expect(statusLine(e({ items: [{ kind: 'reservation', id: 'a', title: 'A' }, { kind: 'boarding_pass', id: 'b', title: 'B' }] })))
      .toBe('Added 2 bookings');
    expect(statusLine(e({ status: 'not_booking' }))).toBe('Not a booking');
    expect(statusLine(e({ status: 'unreadable' }))).toBe("Couldn't read this — try pasting it into Import instead");
    expect(statusLine(e({ status: 'needs_pro' }))).toBe('Needs Pro');
    expect(statusLine(e({ status: 'needs_consent' }))).toBe('Allow AI import to use this');
    expect(statusLine(e({ status: 'daily_limit' }))).toBe('Daily limit reached');
    expect(statusLine(e({ status: 'gmail_confirmation' }))).toBe('Gmail confirmation');
  });
});

describe('gmailCodeFresh / addressFor / GMAIL_FILTER', () => {
  it('shows the Gmail code for a day', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(gmailCodeFresh(new Date('2026-10-05T00:00:00Z'), now)).toBe(true);
    expect(gmailCodeFresh(new Date('2026-10-04T11:00:00Z'), now)).toBe(false);
    expect(gmailCodeFresh(null, now)).toBe(false);
  });
  it('builds the address and the filter', () => {
    expect(addressFor('k7x2m9qpz4')).toBe('k7x2m9qpz4@supernovatravel.xyz');
    expect(addressFor(undefined)).toBeNull();
    expect(GMAIL_FILTER).toBe('subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")');
  });
});
```
Run → FAIL.

- [ ] **Step 2: `utils/emailImport.ts`**

```ts
export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export type EmailImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';
export interface EmailImportEntry {
  id: string; receivedAt: Date | null; subject: string; status: EmailImportStatus;
  items: { kind: 'boarding_pass' | 'reservation'; id: string; title: string }[]; tripTitle?: string;
}

const LINES: Record<Exclude<EmailImportStatus, 'imported'>, string> = {
  not_booking: 'Not a booking',
  unreadable: "Couldn't read this — try pasting it into Import instead",
  needs_pro: 'Needs Pro',
  needs_consent: 'Allow AI import to use this',
  daily_limit: 'Daily limit reached',
  gmail_confirmation: 'Gmail confirmation',
};

export function statusLine(e: EmailImportEntry): string {
  if (e.status !== 'imported') return LINES[e.status];
  const what = e.items.length === 1 ? `Added ${e.items[0].title}` : `Added ${e.items.length} bookings`;
  return e.tripTitle ? `${what} · ${e.tripTitle}` : what;
}

export function gmailCodeFresh(at: Date | null, now: Date): boolean {
  return !!at && now.getTime() - at.getTime() < 24 * 60 * 60 * 1000;
}

export const GMAIL_FILTER = 'subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")';

export function addressFor(token: string | null | undefined): string | null {
  return token ? `${token}@${IMPORT_DOMAIN}` : null;
}
```
Run → PASS.

- [ ] **Step 3: Callables + hook** — `services/gemini.ts`: `callCreateImportAddress` / `callRotateImportAddress` (`httpsCallable` to `createImportAddress` / `rotateImportAddress`, return `.data`). `hooks/useEmailImport.ts`: query `['emailImport', uid]` reading `users/{uid}` (`importAddress.token`, `gmailForwardingCode`) and `users/{uid}/emailImports` ordered by `receivedAt desc`, limit 50, mapped to `EmailImportEntry` (`receivedAt` via `.toDate()`); `create`/`rotate` call the callables, then invalidate. `busy` while calling; `error` holds a readable message ("Couldn't create your address. Try again.").

- [ ] **Step 4: Screen `app/(wallet)/email-import.tsx`** (register `<Stack.Screen name="email-import" />` in the wallet layout). Light chrome, `WalletHeader title="Email import"`, `ScrollView` (20pt margins):
  - **No address:** eyebrow `EMAIL IMPORT`, title (26pt, -0.02em) "Forward bookings to Supernova", body copy from the spec, primary near-black **Create my address** → `requireConsent('import', create)` (render `consentSheet`); Medium haptic.
  - **Address:** surface card — eyebrow `YOUR ADDRESS`, the address (17pt, selectable), **Copy** (`expo-clipboard` `setStringAsync`, Light haptic, label flips to "Copied" for 2 s).
  - **Gmail card** when `gmailCodeFresh`: eyebrow `GMAIL CONFIRMATION CODE`, the code (22pt, tracked), Copy.
  - **Set up automatic forwarding** — a collapsible section (spring height): Gmail steps 1–5 (Settings → Forwarding and POP/IMAP → Add a forwarding address → paste your address → enter the code shown here; then Filters → Create a new filter → paste the filter below → Forward it to your address), the `GMAIL_FILTER` in a mono box with Copy; one line each: "Outlook: Settings → Mail → Rules → forward messages to your address." "iCloud Mail: Settings → Rules → forward to your address."
  - **Recent emails:** eyebrow `RECENT EMAILS`; rows (subject, `timeAgo`, `statusLine`), tapping an `imported` row with one item opens it; several → expand to item rows. Empty state: `EnvelopeSimple` icon, "No emails yet", "Forward a confirmation to see it here.", action "Copy address".
  - **Get a new address:** text link at the bottom → `Alert.alert('Get a new address?', 'Your old address stops working right away.', [Cancel, { text: 'Get a new address', style: 'destructive', onPress: rotate }])`, Medium haptic.
  - `keyboardDismissMode` n/a (no inputs).

- [ ] **Step 5: Wallet entry + From email**
  - `components/wallet/EmailImportRow.tsx`: a hairline row under the header — `EnvelopeSimple` duotone icon, "Email import", secondary "Forward bookings to your own address" (or the address when created), PRO tag (sunken pill) for free users; tap → free: `openPaywall()`, Pro: `router.push('/(wallet)/email-import')`; Light haptic; 56pt.
  - Mount it in `app/(wallet)/index.tsx` above the segment control.
  - Detail screens: when `item.source === 'email'`, a caption "From email" (13pt muted, `EnvelopeSimple` 12pt) under the hero.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npx jest` → clean, all pass. Run the supernova-design checklist on the screen and the row and report it. Regenerate typed routes if `/(wallet)/email-import` is unknown (start Metro briefly).

```bash
git add utils/emailImport.ts __tests__/utils/emailImport.test.ts hooks/useEmailImport.ts services/gemini.ts app components types
git commit -m "feat: Email import screen, wallet entry, From email"
```

---

### Task 5: Docs, review, end-to-end, merge

- [ ] CLAUDE.md: Cloud Functions (`inboundEmail`, the two callables, `emailImport.ts`), Firebase (`inboundAddresses`, `emailImports`, user fields), the Cloudflare Worker (`cloudflare/email-inbound`, how to redeploy, where the secret lives), the notification types, `utils/emailImport.ts`, `useEmailImport`; deleteAccount line.
- [ ] Final whole-branch review (fresh reviewer, Review Focus above); one fix pass, each fix RED→GREEN.
- [ ] End to end with the user: they create the address in a dev/TestFlight build (or via the callable), forward a real confirmation, and we read the log row and the new wallet item together.
- [ ] Merge `feat/email-import` to main and push. No build — ships in 1.0.3.
