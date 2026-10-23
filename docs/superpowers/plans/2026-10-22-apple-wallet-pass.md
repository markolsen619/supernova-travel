# Apple Wallet Boarding Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A boarding pass in Supernova can be added to Apple Wallet as a signed airline boarding pass with its real barcode, through a 5-minute secure link and Apple's own Add sheet.

**Architecture:** Two pure modules (`walletLink.ts` signs/verifies short-lived links; `applePass.ts` builds `pass.json`) wrapped by `appleWalletFunctions.ts` (callable `appleWalletLink` + HTTPS `appleWalletPass` behind a Hosting rewrite) that signs with `passkit-generator` using Firebase secrets. The app opens the link in the in-app browser from an "Add to Apple Wallet" badge.

**Tech Stack:** Firebase Functions v2 (Node 22), `passkit-generator@3.7.0`, Firebase secrets (`defineSecret`), Expo (`expo-web-browser`, already installed), Jest.

**Spec:** `docs/superpowers/specs/2026-10-22-apple-wallet-pass-design.md`

## Global Constraints

- Pass Type ID `pass.com.supernovatravel.app`, team `R47484PAGA`; serial `bp-{passId}`.
- Secrets: `PASSKIT_KEY`, `PASSKIT_CERT`, `PASSKIT_WWDR`, `WALLET_LINK_SECRET`; read only inside the functions that declare them; never logged, never committed. Setting them is a deploy step that needs the owner's OK.
- Link: `https://supernova-a2125.web.app/wallet/apple/{token}.pkpass`, expiry 5 min, HMAC-SHA256, constant-time compare; invalid → 404 empty body; response `application/vnd.apple.pkpass`, `Cache-Control: no-store`.
- Owner-only: callable and HTTPS both check `ownerUid`.
- Barcode map: aztec→`PKBarcodeFormatAztec`, qr→`PKBarcodeFormatQR`, pdf417→`PKBarcodeFormatPDF417`, code128→`PKBarcodeFormatCode128`; unknown/missing format with a barcode → QR; no barcode → no `barcodes`.
- Times: `ignoresTimeZone: true`; `relevantDate` = departure.
- Colours: background `rgb(26,16,53)`, foreground `rgb(255,255,255)`, labels `rgb(196,181,253)`.
- Never in the pass: user name, email, notes, booking references, trip data.
- Free; iOS only in the app; offline → `requireOnline()`.
- UI per CLAUDE.md; Apple's badge per Apple's Add to Apple Wallet guidelines (unaltered artwork, ≥ 30 pt tall, not obscured).

## Review Focus

1. Tampered payload or signature, or an expired token → rejected (Task 1).
2. A token minted for another user's pass → refused at the HTTPS step even with a valid signature, because ownership is re-read (Task 3 code + Task 1 token carries uid).
3. Pass with no barcode / unknown barcode format (Task 2).
4. Departure time stored with a non-UTC offset shows the printed local time (`ignoresTimeZone`) (Task 2 asserts the field).
5. Missing optional fields (gate, seat, terminal, group, arrival) don't produce empty or "undefined" fields (Task 2).

---

### Task 1: Short-lived wallet links

**Files:**
- Create: `functions/src/walletLink.ts`
- Test: `__tests__/functions/walletLink.test.ts`

**Interfaces:**
- Produces: `WALLET_LINK_TTL_MS = 300_000`; `signWalletToken(p: { passId: string; uid: string }, secret: string, now: number): string`; `verifyWalletToken(token: string, secret: string, now: number): { passId: string; uid: string } | null`; `walletTokenFromPath(path: string): string | null`

- [ ] **Step 1: Failing tests**

```ts
// __tests__/functions/walletLink.test.ts
import { signWalletToken, verifyWalletToken, walletTokenFromPath, WALLET_LINK_TTL_MS } from '../../functions/src/walletLink';

const S = 'test-secret-0123456789';
const now = 1_760_000_000_000;

describe('wallet links', () => {
  it('round-trips the pass and owner', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(verifyWalletToken(t, S, now + 1000)).toEqual({ passId: 'p1', uid: 'u1' });
  });
  it('expires after five minutes', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(verifyWalletToken(t, S, now + WALLET_LINK_TTL_MS + 1)).toBeNull();
  });
  it('rejects a changed payload, a changed signature, another secret and junk', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(`p2.u1.${now + WALLET_LINK_TTL_MS}`).toString('base64url');
    expect(verifyWalletToken(`${forged}.${sig}`, S, now)).toBeNull();
    expect(verifyWalletToken(`${payload}.${sig.slice(0, -2)}xx`, S, now)).toBeNull();
    expect(verifyWalletToken(t, 'other-secret', now)).toBeNull();
    expect(verifyWalletToken('nonsense', S, now)).toBeNull();
    expect(verifyWalletToken('', S, now)).toBeNull();
  });
  it('reads the token from the pass URL path', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(walletTokenFromPath(`/wallet/apple/${t}.pkpass`)).toBe(t);
    expect(walletTokenFromPath(`/wallet/apple/${t}`)).toBe(t);
    expect(walletTokenFromPath('/wallet/apple/../x.pkpass')).toBeNull();
    expect(walletTokenFromPath('/cal/abc.ics')).toBeNull();
  });
});
```

Run: `npx jest __tests__/functions/walletLink.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

```ts
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
```

Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add functions/src/walletLink.ts __tests__/functions/walletLink.test.ts
git commit -m "feat(wallet): short-lived signed links to a boarding pass's Wallet file"
```

---

### Task 2: The pass.json builder

**Files:**
- Create: `functions/src/applePass.ts`
- Test: `__tests__/functions/applePass.test.ts`

**Interfaces:**
- Produces: `PASS_TYPE_ID`, `TEAM_ID`; `type PassInput = { id: string; airline?: string; flightNumber?: string; origin?: string; originCity?: string; destination?: string; destinationCity?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string; boardingGroup?: string; barcode?: string; barcodeFormat?: string }`; `passJson(p: PassInput): Record<string, unknown>`

- [ ] **Step 1: Failing tests**

```ts
// __tests__/functions/applePass.test.ts
import { passJson, PASS_TYPE_ID, TEAM_ID } from '../../functions/src/applePass';

const full = {
  id: 'p1', airline: 'British Airways', flightNumber: 'BA117', origin: 'LHR', originCity: 'London', destination: 'JFK', destinationCity: 'New York',
  departureTime: '2026-11-01T09:20:00+00:00', arrivalTime: '2026-11-01T12:30:00-05:00', seat: '14A', gate: 'B3', terminal: '5', boardingGroup: '2',
  barcode: 'M1OLSEN/MARK EABC123 LHRJFKBA 0117', barcodeFormat: 'pdf417',
};
const fields = (j: Record<string, any>, area: string) => (j.boardingPass[area] ?? []) as { key: string; label?: string; value: string; ignoresTimeZone?: boolean }[];
const keys = (j: Record<string, any>, area: string) => fields(j, area).map((f) => f.key);

describe('passJson', () => {
  it('identifies the pass so adding it again replaces it', () => {
    const j = passJson(full);
    expect(j.passTypeIdentifier).toBe(PASS_TYPE_ID);
    expect(j.teamIdentifier).toBe(TEAM_ID);
    expect(j.serialNumber).toBe('bp-p1');
    expect(j.formatVersion).toBe(1);
  });
  it('is an air boarding pass with route, times, seat and gate', () => {
    const j = passJson(full);
    expect(j.boardingPass).toMatchObject({ transitType: 'PKTransitTypeAir' });
    expect(fields(j, 'primaryFields')).toEqual([
      { key: 'origin', label: 'London', value: 'LHR' },
      { key: 'destination', label: 'New York', value: 'JFK' },
    ]);
    expect(keys(j, 'headerFields')).toEqual(['gate']);
    expect(keys(j, 'secondaryFields')).toEqual(['departs', 'seat', 'group']);
    expect(keys(j, 'auxiliaryFields')).toEqual(['flight', 'terminal', 'date']);
    expect(j.relevantDate).toBe('2026-11-01T09:20:00+00:00');
  });
  it('shows times in the departure airport\'s local time', () => {
    const departs = fields(passJson(full), 'secondaryFields').find((f) => f.key === 'departs')!;
    expect(departs.ignoresTimeZone).toBe(true);
    expect(departs.value).toBe('2026-11-01T09:20:00+00:00');
  });
  it('uses the real barcode format', () => {
    expect(passJson(full).barcodes).toEqual([{ format: 'PKBarcodeFormatPDF417', message: full.barcode, messageEncoding: 'iso-8859-1' }]);
    expect((passJson({ ...full, barcodeFormat: 'aztec' }).barcodes as any)[0].format).toBe('PKBarcodeFormatAztec');
    expect((passJson({ ...full, barcodeFormat: 'code128' }).barcodes as any)[0].format).toBe('PKBarcodeFormatCode128');
    expect((passJson({ ...full, barcodeFormat: 'weird' }).barcodes as any)[0].format).toBe('PKBarcodeFormatQR');
    expect((passJson({ ...full, barcodeFormat: undefined }).barcodes as any)[0].format).toBe('PKBarcodeFormatQR');
  });
  it('has no barcode block when there is no barcode', () => {
    expect('barcodes' in passJson({ ...full, barcode: undefined })).toBe(false);
  });
  it('leaves out optional fields that are missing instead of showing blanks', () => {
    const j = passJson({ id: 'p2', flightNumber: 'BA1', origin: 'LHR', destination: 'JFK', departureTime: '2026-11-01T09:20:00Z' });
    expect(fields(j, 'headerFields')).toEqual([{ key: 'gate', label: 'GATE', value: '—' }]);
    expect(keys(j, 'secondaryFields')).toEqual(['departs']);
    expect(keys(j, 'auxiliaryFields')).toEqual(['flight', 'date']);
    expect(JSON.stringify(j)).not.toMatch(/undefined|null/);
  });
  it('never carries personal or booking fields', () => {
    const j = passJson({ ...full, ...({ notes: 'secret note', confirmationCode: 'XYZ789', ownerUid: 'u1', email: 'a@b.c' } as object) });
    expect(JSON.stringify(j)).not.toMatch(/secret note|XYZ789|u1|a@b\.c/);
  });
  it('uses the boarding-pass colours', () => {
    const j = passJson(full);
    expect(j.backgroundColor).toBe('rgb(26,16,53)');
    expect(j.foregroundColor).toBe('rgb(255,255,255)');
    expect(j.labelColor).toBe('rgb(196,181,253)');
  });
});
```

Run `npx jest __tests__/functions/applePass.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement**

```ts
// functions/src/applePass.ts
/**
 * pass.json for a Supernova boarding pass in Apple Wallet (spec 2026-10-22 §2). Pure; signing and zipping happen
 * in appleWalletFunctions.ts. Only whitelisted flight fields — never the owner, notes or booking references.
 */
export const PASS_TYPE_ID = 'pass.com.supernovatravel.app';
export const TEAM_ID = 'R47484PAGA';

export type PassInput = {
  id: string; airline?: string; flightNumber?: string; origin?: string; originCity?: string; destination?: string;
  destinationCity?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string;
  boardingGroup?: string; barcode?: string; barcodeFormat?: string;
};

const FORMATS: Record<string, string> = {
  aztec: 'PKBarcodeFormatAztec', qr: 'PKBarcodeFormatQR', pdf417: 'PKBarcodeFormatPDF417', code128: 'PKBarcodeFormatCode128',
};

type Field = Record<string, unknown> & { key: string; value: string };
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const valid = (iso?: string) => !!iso && !Number.isNaN(Date.parse(iso));

export function passJson(p: PassInput): Record<string, unknown> {
  const flight = text(p.flightNumber) ?? text(p.airline) ?? 'Flight';
  const dep = valid(p.departureTime) ? p.departureTime! : null;
  const time = (key: string, label: string, iso: string): Field =>
    ({ key, label, value: iso, timeStyle: 'PKDateStyleShort', ignoresTimeZone: true });

  const secondary: Field[] = [];
  if (dep) secondary.push(time('departs', 'DEPARTS', dep));
  if (text(p.seat)) secondary.push({ key: 'seat', label: 'SEAT', value: text(p.seat)! });
  if (text(p.boardingGroup)) secondary.push({ key: 'group', label: 'GROUP', value: text(p.boardingGroup)! });

  const auxiliary: Field[] = [{ key: 'flight', label: 'FLIGHT', value: flight }];
  if (text(p.terminal)) auxiliary.push({ key: 'terminal', label: 'TERMINAL', value: text(p.terminal)! });
  if (dep) auxiliary.push({ key: 'date', label: 'DATE', value: dep, dateStyle: 'PKDateStyleMedium', ignoresTimeZone: true });

  const back: Field[] = [];
  if (text(p.airline)) back.push({ key: 'airline', label: 'Airline', value: text(p.airline)! });
  if (valid(p.arrivalTime)) back.push({ key: 'arrives', label: 'Arrives', value: p.arrivalTime!, dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleShort', ignoresTimeZone: true });
  back.push({ key: 'source', label: 'Supernova', value: 'Added from Supernova' });

  const json: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    serialNumber: `bp-${p.id}`,
    organizationName: 'Supernova',
    description: `Boarding pass ${flight}`,
    logoText: text(p.airline) ?? 'Supernova',
    backgroundColor: 'rgb(26,16,53)',
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(196,181,253)',
    boardingPass: {
      transitType: 'PKTransitTypeAir',
      headerFields: [{ key: 'gate', label: 'GATE', value: text(p.gate) ?? '—' }],
      primaryFields: [
        { key: 'origin', label: text(p.originCity) ?? 'FROM', value: text(p.origin) ?? '—' },
        { key: 'destination', label: text(p.destinationCity) ?? 'TO', value: text(p.destination) ?? '—' },
      ],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: back,
    },
  };
  if (dep) json.relevantDate = dep;
  if (text(p.barcode)) {
    json.barcodes = [{ format: FORMATS[p.barcodeFormat ?? ''] ?? 'PKBarcodeFormatQR', message: text(p.barcode)!, messageEncoding: 'iso-8859-1' }];
  }
  return json;
}
```

Note the test for missing optional fields expects primary labels "FROM"/"TO" only implicitly; the strings `null`/`undefined` must never appear.

Run again → PASS. `cd functions && npm run build` → compiles.

- [ ] **Step 3: Commit**

```bash
git add functions/src/applePass.ts __tests__/functions/applePass.test.ts
git commit -m "feat(wallet): Apple Wallet boarding pass contents"
```

---

### Task 3: Signing, endpoints, pass images and a local signature check

**Files:**
- Modify: `functions/package.json` (+ `passkit-generator@3.7.0`), `functions/src/index.ts`, `firebase.json`
- Create: `functions/src/appleWalletFunctions.ts`, `functions/assets/pass/{icon,icon@2x,icon@3x,logo,logo@2x}.png`, `scripts/check-apple-pass.mjs`

**Interfaces:**
- Consumes: Task 1 and Task 2 exports.
- Produces: callable `appleWalletLink({ passId }) → { url }`; HTTPS `appleWalletPass`; `buildSignedPass(pass, certs, images): Buffer` (exported for the check script).

- [ ] **Step 1: Install and make images**

```bash
cd functions && npm install passkit-generator@3.7.0 --save-exact && cd ..
mkdir -p functions/assets/pass
for s in 29 58 87; do n=icon; [ $s = 58 ] && n=icon@2x; [ $s = 87 ] && n=icon@3x; sips -z $s $s assets/images/SupernovaStar.png --out functions/assets/pass/$n.png >/dev/null; done
sips -Z 50 assets/images/SupernovaStar.png --out functions/assets/pass/logo.png >/dev/null
sips -Z 100 assets/images/SupernovaStar.png --out functions/assets/pass/logo@2x.png >/dev/null
```

Expected: five PNGs; `sips -g pixelWidth -g pixelHeight` confirms sizes. Ensure `functions/assets/**` is included in the deployed source (check `firebase.json` `functions.ignore`).

- [ ] **Step 2: Implement `functions/src/appleWalletFunctions.ts`**

```ts
/**
 * Apple Wallet boarding passes (spec 2026-10-22): a callable mints a 5-minute link for the owner's pass; the HTTPS
 * function behind /wallet/apple/** verifies it, re-checks ownership and serves a freshly signed .pkpass.
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { PKPass } from 'passkit-generator';
import { passJson, type PassInput } from './applePass';
import { signWalletToken, verifyWalletToken, walletTokenFromPath } from './walletLink';

const PASSKIT_KEY = defineSecret('PASSKIT_KEY');
const PASSKIT_CERT = defineSecret('PASSKIT_CERT');
const PASSKIT_WWDR = defineSecret('PASSKIT_WWDR');
const WALLET_LINK_SECRET = defineSecret('WALLET_LINK_SECRET');

const db = admin.firestore();
const HOST = 'https://supernova-a2125.web.app';
const IMAGE_NAMES = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png'];

let images: Record<string, Buffer> | null = null;
function passImages(dir = path.join(__dirname, '..', 'assets', 'pass')): Record<string, Buffer> {
  if (!images) images = Object.fromEntries(IMAGE_NAMES.map((n) => [n, fs.readFileSync(path.join(dir, n))]));
  return images;
}

export function buildSignedPass(
  pass: PassInput,
  certs: { signerKey: string; signerCert: string; wwdr: string },
  imgs: Record<string, Buffer> = passImages(),
): Buffer {
  const pk = new PKPass({ ...imgs, 'pass.json': Buffer.from(JSON.stringify(passJson(pass))) }, certs);
  return pk.getAsBuffer();
}

export const appleWalletLink = onCall({ region: 'us-central1', secrets: [WALLET_LINK_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const passId = (request.data as { passId?: unknown } | undefined)?.passId;
  if (typeof passId !== 'string' || !passId) throw new HttpsError('invalid-argument', 'passId is required');
  const snap = await db.doc(`boarding_passes/${passId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such boarding pass');
  if (snap.get('ownerUid') !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your boarding pass');
  const token = signWalletToken({ passId, uid: request.auth.uid }, WALLET_LINK_SECRET.value(), Date.now());
  return { url: `${HOST}/wallet/apple/${token}.pkpass` };
});

export const appleWalletPass = onRequest(
  { region: 'us-central1', secrets: [PASSKIT_KEY, PASSKIT_CERT, PASSKIT_WWDR, WALLET_LINK_SECRET] },
  async (req, res) => {
    const token = req.method === 'GET' || req.method === 'HEAD' ? walletTokenFromPath(req.path) : null;
    const claim = token ? verifyWalletToken(token, WALLET_LINK_SECRET.value(), Date.now()) : null;
    const snap = claim ? await db.doc(`boarding_passes/${claim.passId}`).get() : null;
    if (!claim || !snap?.exists || snap.get('ownerUid') !== claim.uid) { res.status(404).send(''); return; }
    try {
      const file = buildSignedPass({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) }, {
        signerKey: PASSKIT_KEY.value(), signerCert: PASSKIT_CERT.value(), wwdr: PASSKIT_WWDR.value(),
      });
      res.set('Content-Type', 'application/vnd.apple.pkpass');
      res.set('Content-Disposition', `attachment; filename="boarding-pass.pkpass"`);
      res.set('Cache-Control', 'no-store');
      res.status(200).send(file);
    } catch (e) {
      console.error('[appleWalletPass] signing failed:', (e as Error).message);
      res.status(500).send('');
    }
  },
);
```

Wire: `functions/src/index.ts` → `export { appleWalletLink, appleWalletPass } from './appleWalletFunctions';`; `firebase.json` hosting rewrites (first entry): `{ "source": "/wallet/apple/**", "function": { "functionId": "appleWalletPass", "region": "us-central1" } }`.

- [ ] **Step 3: Local signature check with the real certificate** — `scripts/check-apple-pass.mjs`: requires `functions/lib/appleWalletFunctions` is NOT importable without firebase-admin init, so import `functions/lib/applePass.js` and `passkit-generator` directly; read the three PEMs from `~/.config/supernova/`, sign a sample pass (fake flight, sample PDF417 string), write it to the scratchpad, then:

```bash
unzip -o -q $OUT -d $DIR && test -f $DIR/pass.json -a -f $DIR/manifest.json -a -f $DIR/signature
openssl smime -verify -binary -inform der -in $DIR/signature -content $DIR/manifest.json -noverify -out /dev/null
```

Expected: `Verification successful`. Never print key or certificate contents. If `buildSignedPass` is needed directly, move it into a firebase-free module (`functions/src/applePassSign.ts`) and import that from both — ledger the ruling.

- [ ] **Step 4: Verify**

Run: `(cd functions && npm run build) && npx jest --silent && node scripts/check-apple-pass.mjs`
Expected: build clean; suite green; "Verification successful".

- [ ] **Step 5: Commit**

```bash
git add functions/package.json functions/package-lock.json functions/src functions/assets firebase.json scripts/check-apple-pass.mjs
git commit -m "feat(wallet): sign and serve Apple Wallet boarding passes through 5-minute links"
```

---

### Task 4: The Add to Apple Wallet badge

**Files:**
- Create: `assets/wallet/add-to-apple-wallet.png` (+ `@2x`, `@3x`) from Apple's official badge kit (US-UK English, black badge), `services/appleWallet.ts`, `components/wallet/AddToAppleWallet.tsx`
- Modify: `app/(wallet)/boarding-pass/[id].tsx` (render under the barcode, iOS only), `CLAUDE.md`

**Interfaces:**
- Consumes: callable `appleWalletLink`.
- Produces: `getAppleWalletLink(passId: string): Promise<string>`; `<AddToAppleWallet passId />`

- [ ] **Step 1: Badge artwork** — download Apple's "Add to Apple Wallet" badge kit from Apple's guidelines page (developer.apple.com/wallet/add-to-apple-wallet-guidelines), take the US-UK black PNGs (or export the SVG to PNG at 1×/2×/3×, height 48 pt), commit under `assets/wallet/`. Do not alter the artwork.

- [ ] **Step 2: Service and component**

```ts
// services/appleWallet.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

/** A 5-minute link to this boarding pass's Apple Wallet file (functions/src/appleWalletFunctions.ts). */
export async function getAppleWalletLink(passId: string): Promise<string> {
  const res = await httpsCallable<{ passId: string }, { url: string }>(functions, 'appleWalletLink')({ passId });
  return res.data.url;
}
```

```tsx
// components/wallet/AddToAppleWallet.tsx
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { requireOnline } from '@/services/offline';
import { getAppleWalletLink } from '@/services/appleWallet';

/**
 * Apple's official "Add to Apple Wallet" badge (unaltered, per Apple's guidelines). Opens a 5-minute link in the
 * in-app browser, which shows Wallet's Add sheet; Safari if that fails. iPhone only.
 */
export function AddToAppleWallet({ passId }: { passId: string }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlePress = useCallback(async () => {
    if (busy || !requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    try {
      const url = await getAppleWalletLink(passId);
      try { await WebBrowser.openBrowserAsync(url); } catch { await Linking.openURL(url); }
    } catch {
      setError("Couldn't prepare the pass. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, passId]);
  if (Platform.OS !== 'ios') return null;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={handlePress} disabled={busy} accessibilityRole="button" accessibilityLabel="Add to Apple Wallet" style={styles.badgeHit}>
        {busy ? <ActivityIndicator /> : <Image source={require('@/assets/wallet/add-to-apple-wallet.png')} style={styles.badge} resizeMode="contain" />}
      </TouchableOpacity>
      {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  badgeHit: { minHeight: 48, justifyContent: 'center' },
  badge: { height: 48, width: 156 },
  error: { fontSize: 13 },
});
```

Adjust `width` to the badge's real aspect ratio after Step 1.

- [ ] **Step 3: Place it** — in `app/(wallet)/boarding-pass/[id].tsx`, directly below the barcode block: `<AddToAppleWallet passId={pass.id} />`.

- [ ] **Step 4: CLAUDE.md** — an "Apple Wallet passes" bullet under Cloud Functions (Pass Type ID, team, secrets, 5-min HMAC link, `/wallet/apple/**` rewrite, owner re-check, `pass.json` whitelist, barcode mapping, `ignoresTimeZone`, cert expiry 2027-11-22 → renew, `scripts/check-apple-pass.mjs`) and the new app files.

- [ ] **Step 5: Verify and commit**

Run: `npx jest --silent && npx tsc --noEmit -p . && npm run lint -- --quiet`
Expected: green and clean. Run the supernova-design checklist for the badge placement.

```bash
git add assets/wallet services/appleWallet.ts components/wallet/AddToAppleWallet.tsx "app/(wallet)/boarding-pass/[id].tsx" CLAUDE.md
git commit -m "feat(wallet): Add to Apple Wallet on boarding passes"
```

Deploy (owner's OK): set the four secrets from `~/.config/supernova` files (`firebase functions:secrets:set PASSKIT_KEY --data-file ~/.config/supernova/passkit.key`, same for `passkit-cert.pem`, `wwdr-g4.pem`; `WALLET_LINK_SECRET` from `openssl rand -base64 48` piped, never echoed), then `firebase deploy --only functions:appleWalletLink,functions:appleWalletPass,hosting`.
