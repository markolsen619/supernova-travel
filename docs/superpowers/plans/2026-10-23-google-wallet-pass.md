# Google Wallet Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android users add a Supernova boarding pass to Google Wallet (generic pass), kept up to date when the pass changes.

**Architecture:** Pure pass builder `functions/src/googlePass.ts`; IAM-impersonation + Wallet REST in `functions/src/googleWalletApi.ts`; callable + trigger hook in `functions/src/googleWalletFunctions.ts` / `appleWalletServiceFunctions.ts`; Android button `components/wallet/AddToGoogleWallet.tsx` using `react-native-wallet-manager.addPassToGoogleWallet(jwt)`.

**Tech Stack:** Firebase Functions v2, IAM Credentials API (`signJwt`, `generateAccessToken`), Google Wallet REST v1 (`genericClass`, `genericObject`), react-native-svg, react-native-wallet-manager 2.2.0, Jest.

**Spec:** `docs/superpowers/specs/2026-10-23-google-wallet-pass-design.md`

## Global Constraints

- Issuer `3388000000023211693`; class `3388000000023211693.supernova_boarding_pass`; object `3388000000023211693.bp_{passId}`.
- Wallet service account `supernova-wallet@supernova-a2125.iam.gserviceaccount.com`, impersonated by the functions' default account (Token Creator on that one account, granted 2026-10-23). No key file, ever.
- Pass content: whitelisted flight fields only — never name, notes, booking references or trip data. Reuse `statusLine` from `applePass.ts`.
- Times shown in the traveler's IANA zone (`walletTimeZone`, sent by the app); invalid/missing → UTC with a "UTC" label.
- Button: Google's official enUS "Add to Google Wallet" SVG, unaltered, ≥ 48 dp tall, 8 dp clear space; Android only; hidden when `canAddPasses()` is false.
- Copy: sentence case, no exclamation marks.

## Review Focus

1. A pass edited before it was ever saved to Google Wallet — PATCH answers 404; must be ignored quietly, never retried or logged as an error storm.
2. The trigger: Apple and Google updates must be independent — a Google failure (IAM not propagated, Wallet API error) must not stop the Apple push, and vice versa.
3. Time-zone strings from the phone are untrusted: an invalid zone must not throw (`Intl` RangeError) — fall back to UTC.
4. Object ids allow only `[A-Za-z0-9._-]`; a Firestore id is safe, but the builder must refuse anything else rather than send a bad id.
5. A deleted pass: its Google object is set INACTIVE; a 404 there is fine.

---

### Task 1: The pass (pure)

**Files:** Create `functions/src/googlePass.ts`; Test `__tests__/functions/googlePass.test.ts`

**Interfaces:**
- Consumes: `statusLine(p: PassInput)`, `PassInput` from `applePass.ts`.
- Produces: `ISSUER_ID`, `CLASS_ID`, `WALLET_SERVICE_ACCOUNT`, `googleObjectId(passId): string | null`, `formatDeparture(iso, timeZone): string | null`, `genericObject(p: PassInput, timeZone: string | null): Record<string, unknown>`, `genericClass(): Record<string, unknown>`, `saveJwtClaims(object, nowS: number): Record<string, unknown>`.

- [ ] **Step 1: Tests**

```ts
// __tests__/functions/googlePass.test.ts
import { CLASS_ID, ISSUER_ID, WALLET_SERVICE_ACCOUNT, formatDeparture, genericClass, genericObject, googleObjectId, saveJwtClaims } from '../../functions/src/googlePass';

const full = {
  id: 'p1', airline: 'KLM', flightNumber: 'KL1357', origin: 'AMS', originCity: 'Amsterdam', destination: 'LHR', destinationCity: 'London',
  departureTime: '2026-11-01T09:20:00.000Z', seat: '14A', gate: 'D7', terminal: '2', boardingGroup: '3',
  barcode: 'M1OLSEN/MARK EABC123 AMSLHRKL 1357', barcodeFormat: 'pdf417',
};
const mod = (o: Record<string, any>, id: string) => (o.textModulesData as any[]).find((m) => m.id === id);

describe('ids', () => {
  it('one object per boarding pass under our issuer', () => {
    expect(googleObjectId('p1')).toBe(`${ISSUER_ID}.bp_p1`);
    expect(CLASS_ID).toBe('3388000000023211693.supernova_boarding_pass');
  });
  it('refuses ids with characters Wallet rejects', () => {
    expect(googleObjectId('a/b')).toBeNull();
    expect(googleObjectId('')).toBeNull();
  });
});

describe('formatDeparture', () => {
  it('in the traveler\'s zone', () => {
    expect(formatDeparture('2026-11-01T09:20:00.000Z', 'Europe/Amsterdam')).toBe('Sun, Nov 1 · 10:20');
  });
  it('an invalid or missing zone falls back to UTC, labelled', () => {
    expect(formatDeparture('2026-11-01T09:20:00.000Z', 'Mars/Base')).toBe('Sun, Nov 1 · 09:20 UTC');
    expect(formatDeparture('2026-11-01T09:20:00.000Z', null)).toBe('Sun, Nov 1 · 09:20 UTC');
  });
  it('no time, no line', () => {
    expect(formatDeparture('nonsense', 'UTC')).toBeNull();
  });
});

describe('genericObject', () => {
  const o = genericObject(full, 'Europe/Amsterdam') as Record<string, any>;
  it('identifies the pass and its class', () => {
    expect(o.id).toBe(`${ISSUER_ID}.bp_p1`);
    expect(o.classId).toBe(CLASS_ID);
    expect(o.state).toBe('ACTIVE');
  });
  it('route as the header, flight as the subheader', () => {
    expect(o.header.defaultValue.value).toBe('Amsterdam → London');
    expect(o.subheader.defaultValue.value).toBe('KL1357');
    expect(o.cardTitle.defaultValue.value).toBe('Supernova');
  });
  it('the details that matter at the airport', () => {
    expect(mod(o, 'departs').body).toBe('Sun, Nov 1 · 10:20');
    expect(mod(o, 'seat').body).toBe('14A');
    expect(mod(o, 'gate').body).toBe('D7');
    expect(mod(o, 'terminal').body).toBe('2');
    expect(mod(o, 'group').body).toBe('3');
  });
  it('the real barcode format', () => {
    expect(o.barcode).toEqual({ type: 'PDF_417', value: full.barcode });
    expect((genericObject({ ...full, barcodeFormat: 'aztec' }, null) as any).barcode.type).toBe('AZTEC');
    expect((genericObject({ ...full, barcodeFormat: 'weird' }, null) as any).barcode.type).toBe('QR_CODE');
    expect((genericObject({ ...full, barcode: undefined }, null) as any).barcode).toBeUndefined();
  });
  it('leaves out what it does not know', () => {
    const bare = genericObject({ id: 'p2', flightNumber: 'BA1', origin: 'LHR', destination: 'JFK' }, null) as any;
    expect(bare.header.defaultValue.value).toBe('LHR → JFK');
    expect(bare.textModulesData.map((m: any) => m.id)).toEqual([]);
    expect(JSON.stringify(bare)).not.toMatch(/undefined|null/);
  });
  it('a status line once checked live', () => {
    expect(mod(genericObject({ ...full, liveCheckedAtMs: 1 }, null) as any, 'status').body).toBe('On time');
    expect(mod(genericObject({ ...full, delayMinutes: 45, liveDepartureLocal: '14:35' }, null) as any, 'status').body).toBe('Delayed 45 min · 14:35');
  });
  it('expires a day after departure', () => {
    expect(o.validTimeInterval).toEqual({ end: { date: '2026-11-02T09:20:00.000Z' } });
  });
  it('never carries personal fields', () => {
    const j = JSON.stringify(genericObject({ ...full, notes: 'secret', ownerUid: 'u1', recordLocator: 'ABC123' } as never, null));
    expect(j).not.toMatch(/secret|u1|recordLocator|notes/);
  });
});

describe('class and save link', () => {
  it('a generic class with our id', () => {
    expect(genericClass()).toEqual({ id: CLASS_ID });
  });
  it('save-to-wallet claims, valid one hour', () => {
    const c = saveJwtClaims({ id: 'x' }, 1000) as any;
    expect(c).toEqual({ iss: WALLET_SERVICE_ACCOUNT, aud: 'google', typ: 'savetowallet', iat: 1000, exp: 4600, origins: [], payload: { genericObjects: [{ id: 'x' }] } });
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/functions/googlePass.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `functions/src/googlePass.ts`:

```ts
/**
 * Google Wallet boarding pass (spec 2026-10-23-google-wallet-pass-design.md): a generic pass, pure. Same whitelist as
 * the Apple pass (applePass.ts) — never the owner, notes, booking references or trip data.
 */
import { statusLine, type PassInput } from './applePass';

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
  add('departs', 'Departs', formatDeparture(p.departureTime, timeZone));
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

export function genericClass(): Record<string, unknown> {
  return { id: CLASS_ID };
}

export function saveJwtClaims(object: Record<string, unknown>, nowS: number): Record<string, unknown> {
  return { iss: WALLET_SERVICE_ACCOUNT, aud: 'google', typ: 'savetowallet', iat: nowS, exp: nowS + 3600, origins: [], payload: { genericObjects: [object] } };
}
```

- [ ] **Step 4: Run** the test — Expected: PASS. **Step 5: Commit** `feat(google-wallet): the generic boarding pass`.

### Task 2: Talking to Google (wiring)

**Files:** Create `functions/src/googleWalletApi.ts`

**Interfaces:**
- Produces: `signSaveJwt(claims): Promise<string>`, `ensureClass(): Promise<void>`, `patchObject(id: string, object: Record<string, unknown>): Promise<'ok' | 'missing'>`.

- [ ] **Step 1: Write**

```ts
/**
 * Google Wallet calls as supernova-wallet without a key file (spec §Signing): the functions' own account asks the IAM
 * Credentials API to sign the save JWT and to mint a Wallet access token on supernova-wallet's behalf.
 */
import * as admin from 'firebase-admin';
import { CLASS_ID, WALLET_SERVICE_ACCOUNT, genericClass } from './googlePass';

const IAM = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(WALLET_SERVICE_ACCOUNT)}`;
const WALLET = 'https://walletobjects.googleapis.com/walletobjects/v1';

async function ownToken(): Promise<string> {
  return (await admin.credential.applicationDefault().getAccessToken()).access_token;
}

async function iam<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${IAM}:${method}`, { method: 'POST', headers: { Authorization: `Bearer ${await ownToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  return fetch(`${WALLET}${path}`, { method, headers: { Authorization: `Bearer ${await walletAuth()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
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

/** Updates a saved pass; 'missing' when it was never saved (the JWT was minted but not used). */
export async function patchObject(id: string, object: Record<string, unknown>): Promise<'ok' | 'missing'> {
  const res = await wallet('PATCH', `/genericObject/${id}`, object);
  if (res.status === 404) return 'missing';
  if (!res.ok) throw new Error(`genericObject patch failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return 'ok';
}
```

- [ ] **Step 2: Build** `cd functions && npm run build` — Expected: clean. **Step 3: Commit** `feat(google-wallet): sign and update passes as supernova-wallet, no key file`.

### Task 3: Callable, updates, cleanup, logo, docs

**Files:** Create `functions/src/googleWalletFunctions.ts`; Modify `functions/src/appleWalletServiceFunctions.ts` (trigger), `functions/src/index.ts`, `hosting/wallet/google-logo.png` (new), `hosting/privacy.html`, `CLAUDE.md`

- [ ] **Step 1: Callable**

```ts
/** Google Wallet boarding passes (spec 2026-10-23-google-wallet-pass-design.md): the owner's save link. */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { PassInput } from './applePass';
import { genericObject, googleObjectId, saveJwtClaims } from './googlePass';
import { ensureClass, signSaveJwt } from './googleWalletApi';

const db = admin.firestore();

export const googleWalletJwt = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const data = (request.data ?? {}) as { passId?: unknown; timeZone?: unknown };
  if (typeof data.passId !== 'string' || !googleObjectId(data.passId)) throw new HttpsError('invalid-argument', 'passId is required');
  const timeZone = typeof data.timeZone === 'string' && data.timeZone.length <= 64 ? data.timeZone : null;
  const ref = db.doc(`boarding_passes/${data.passId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such boarding pass');
  if (snap.get('ownerUid') !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your boarding pass');
  try {
    await ensureClass();
    const object = genericObject({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) }, timeZone);
    const jwt = await signSaveJwt(saveJwtClaims(object, Math.floor(Date.now() / 1000)));
    await ref.update({ walletTimeZone: timeZone, googleWalletObject: true });
    return { jwt };
  } catch (e) {
    console.error('[googleWalletJwt] failed', (e as Error).message);
    throw new HttpsError('unavailable', 'Could not prepare the pass');
  }
});
```

- [ ] **Step 2: Trigger** — in `onBoardingPassWrittenWallet` (`appleWalletServiceFunctions.ts`), import `{ genericObject, googleObjectId }` and `{ patchObject }`; restructure the body so Apple and Google are independent:

```ts
    const serial = `bp-${event.params.passId}`;
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    const googleId = googleObjectId(event.params.passId);
    const google = async (object: Record<string, unknown>) => {
      if (!googleId || !(before?.googleWalletObject || after?.googleWalletObject)) return;
      try { await patchObject(googleId, object); } catch (e) { console.warn('[googleWallet] update failed', (e as Error).message); }
    };
    if (!after) {
      const regs = await db.collection(REGS).where('serial', '==', serial).get();
      await Promise.all(regs.docs.map((d) => d.ref.delete()));
      await google({ state: 'INACTIVE' });
      return;
    }
    if (!walletFieldsChanged(before, after)) return;
    await event.data!.after.ref.update({ walletUpdatedAtMs: Date.now() });
    await google(genericObject({ id: event.params.passId, ...(after as Omit<PassInput, 'id'>) }, (after.walletTimeZone as string | null) ?? null));
    const regs = await db.collection(REGS).where('serial', '==', serial).get();
    if (regs.empty) return;
    const gone = await pushPassUpdates(regs.docs.map((d) => String(d.get('pushToken'))), { cert: PASSKIT_CERT.value(), key: PASSKIT_KEY.value() });
    await Promise.all(regs.docs.filter((d) => gone.includes(String(d.get('pushToken')))).map((d) => d.ref.delete()));
```

(This also applies the deferred review minor: registrations are queried only after `walletFieldsChanged`.)

- [ ] **Step 3: Export** in `functions/src/index.ts`: `export { googleWalletJwt } from './googleWalletFunctions';`

- [ ] **Step 4: Logo** — `mkdir -p hosting/wallet && sips -Z 660 assets/images/SupernovaStar.png --out hosting/wallet/google-logo.png` (Google recommends 660×660).

- [ ] **Step 5: Privacy** — after the Apple Wallet paragraph in `hosting/privacy.html`:

```html
  <p>If you add a boarding pass to Google Wallet, its flight details (route, times, seat, gate and barcode — never your name or booking reference) are sent to Google so the pass can appear in your Google Wallet, and we update it there when those details change.</p>
```

- [ ] **Step 6: CLAUDE.md** — after the Apple Wallet bullet add a **Google Wallet boarding passes** bullet (spec path; pure `googlePass.ts`, API `googleWalletApi.ts`, callable `googleWalletJwt`; issuer + class ids; signing by impersonating `supernova-wallet` via IAM Credentials, no key file, Token Creator granted to the default compute account on that one service account; updates through `onBoardingPassWrittenWallet` (PATCH, 404 = never saved); deleted pass → INACTIVE; time zone from the app saved as `walletTimeZone`; demo mode until publishing access; app `AddToGoogleWallet` Android only).

- [ ] **Step 7: Build + full tests** `(cd functions && npm run build) && npx jest 2>&1 | tail -3` — Expected: clean, all pass. **Step 8: Commit** `feat(google-wallet): save links, live updates, privacy and docs`.

### Task 4: The Android button

**Files:** Create `utils/googleWalletOutcome.ts`, `__tests__/utils/googleWalletOutcome.test.ts`, `components/wallet/googleWalletButtonSvg.ts` (Google's enUS SVG verbatim), `components/wallet/AddToGoogleWallet.tsx`, `services/googleWallet.ts`; Modify `app/(wallet)/boarding-pass/[id].tsx`

- [ ] **Step 1: Test**

```ts
// __tests__/utils/googleWalletOutcome.test.ts
import { googleWalletOutcome } from '@/utils/googleWalletOutcome';

describe('googleWalletOutcome', () => {
  it('backing out is silent', () => expect(googleWalletOutcome('RESULT_CANCELED')).toBe('cancelled'));
  it('another add already running is silent', () => expect(googleWalletOutcome('ADD_PASS_IN_PROGRESS')).toBe('cancelled'));
  it('anything else is an error worth saying', () => {
    expect(googleWalletOutcome('API_ERROR')).toBe('error');
    expect(googleWalletOutcome(undefined)).toBe('error');
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found). **Step 3: Implement**

```ts
/** What a react-native-wallet-manager addPassToGoogleWallet rejection means for the person (Android). */
export function googleWalletOutcome(code: string | undefined): 'cancelled' | 'error' {
  return code === 'RESULT_CANCELED' || code === 'ADD_PASS_IN_PROGRESS' ? 'cancelled' : 'error';
}
```

- [ ] **Step 4: Service** `services/googleWallet.ts`:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

/** A signed "Save to Google Wallet" JWT for one of your boarding passes (functions/src/googleWalletFunctions.ts). */
export async function getGoogleWalletJwt(passId: string): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  const fn = httpsCallable<{ passId: string; timeZone: string | null }, { jwt: string }>(functions, 'googleWalletJwt');
  return (await fn({ passId, timeZone })).data.jwt;
}
```

- [ ] **Step 5: Button artwork** — `components/wallet/googleWalletButtonSvg.ts`: `/** Google's official enUS "Add to Google Wallet" button (developers.google.com/wallet brand guidelines, add-to-wallet-svg.zip, 2026-10-23). Unaltered — Google forbids changes. */ export const GOOGLE_WALLET_BUTTON_SVG = \`…\`;` with the file's contents verbatim.

- [ ] **Step 6: Component** `components/wallet/AddToGoogleWallet.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import WalletManager from 'react-native-wallet-manager';
import { useTheme } from '@/hooks/useTheme';
import { requireOnline } from '@/services/offline';
import { getGoogleWalletJwt } from '@/services/googleWallet';
import { googleWalletOutcome } from '@/utils/googleWalletOutcome';
import { GOOGLE_WALLET_BUTTON_SVG } from '@/components/wallet/googleWalletButtonSvg';

/**
 * Google's own "Add to Google Wallet" button under the boarding pass (Android). Asks the server for a signed save
 * link and shows Google Wallet's add screen in the app. Hidden on iOS and when the phone can't save passes.
 */
export function AddToGoogleWallet({ passId, style }: { passId: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [canAdd, setCanAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    WalletManager.canAddPasses().then((ok) => { if (alive) setCanAdd(!!ok); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const handlePress = useCallback(async () => {
    if (busy || !requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    try {
      const jwt = await getGoogleWalletJwt(passId);
      try {
        await WalletManager.addPassToGoogleWallet(jwt);
      } catch (e) {
        if (googleWalletOutcome((e as { code?: string }).code) === 'error') setError("Couldn't add the pass. Try again.");
      }
    } catch {
      setError("Couldn't prepare the pass. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, passId]);

  if (Platform.OS !== 'android' || !canAdd) return null;
  return (
    <View style={[styles.wrap, style]}>
      <TouchableOpacity onPress={handlePress} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add to Google Wallet" style={styles.button}>
        <SvgXml xml={GOOGLE_WALLET_BUTTON_SVG} width="100%" height="100%" />
        {busy ? <View style={[StyleSheet.absoluteFill, styles.busy]}><ActivityIndicator color="#ffffff" /></View> : null}
      </TouchableOpacity>
      {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  // Google: at least 48 dp tall, artwork unscaled in ratio (283×50).
  button: { height: 52, aspectRatio: 283 / 50, borderRadius: 26, overflow: 'hidden' },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  error: { fontSize: 13, textAlign: 'center' },
});
```

- [ ] **Step 7: Screen** — in `app/(wallet)/boarding-pass/[id].tsx` import `AddToGoogleWallet` and render `<AddToGoogleWallet passId={pass.id} style={styles.tripBlock} />` right after `<AddToAppleWallet … />`.

- [ ] **Step 8: Verify** `npx jest __tests__/utils/googleWalletOutcome.test.ts && npx tsc --noEmit -p . && npx eslint components/wallet/AddToGoogleWallet.tsx services/googleWallet.ts utils/googleWalletOutcome.ts` — Expected: pass, clean. **Step 9: Commit** `feat(google-wallet): Google's Add to Google Wallet button on Android`.

### Task 5: Deploy and live checks

- [ ] **Step 1:** `npx firebase deploy --only functions:googleWalletJwt,functions:onBoardingPassWrittenWallet,hosting` — Expected: complete.
- [ ] **Step 2:** `curl -s -o /dev/null -w "%{http_code}" https://supernova-a2125.web.app/wallet/google-logo.png` → 200.
- [ ] **Step 3:** Scratchpad script: custom token for the owner → call `googleWalletJwt` for the KL1357 pass with `Europe/Amsterdam` → decode the JWT payload (no signature printing): `iss` = supernova-wallet, object id, class id, no personal fields. Then open `https://pay.google.com/gp/v/save/{jwt}` in Chrome (owner signed in; demo mode needs the owner as a test account in the console — add them first) and confirm the pass preview renders.
- [ ] **Step 4:** Push to main after the secret scan succeeds (`&&`-gated).
