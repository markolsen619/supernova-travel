# Live Flight Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro users get gate-change, delay, landed and cancelled alerts within AviationStack's free 100 calls/month, and Apple Wallet passes update themselves when a pass changes.

**Architecture:** Pure rules in `functions/src/flightPolling.ts` (when to check), `functions/src/flightLive.ts` (what a check means), `functions/src/applePass.ts` + `functions/src/appleWalletService.ts` (pass contents, Wallet web-service routing); thin wiring in `checkFlightStatus.ts`, `apns.ts` and `appleWalletServiceFunctions.ts`. Client gets one new notification type and copy fixes.

**Tech Stack:** Firebase Functions v2 (TypeScript), Firestore, AviationStack HTTP API, Apple PassKit web service + APNs over Node `http2`, passkit-generator 3.7, Jest.

**Spec:** `docs/superpowers/specs/2026-10-23-live-flight-updates-design.md`

## Global Constraints

- AviationStack free plan: ≤ 3 calls per flight (T−120 min, T−45 min, arrival + 30 min); stop the run on the plan-limit error; no retries.
- Live gate/delay data Pro only (`filterPassesForPaidOwners` before any call); Wallet updates for everyone.
- Never store a new `BoardingPassStatus` value (shipped apps index it). New fields only: `gateSource`, `delayMinutes`, `delayAlertedMinutes`, `liveDepartureLocal`, `liveCheckedAtMs`, `walletUpdatedAtMs`.
- AviationStack times show the airport's clock behind `+00:00`: use only the `HH:MM` text, never parse as UTC.
- New notification type `flight_change` must be added in `utils/notificationRoute.ts` (pushData is generic over `passId`).
- `webServiceURL` = `https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService`; `authenticationToken` = base64url HMAC-SHA256(`WALLET_LINK_SECRET`, `"wallet-auth:" + serial`).
- Wallet registrations `appleWalletRegistrations/{device}__{serial}`: server only, removed with the pass and by `deleteAccount`.
- Copy: sentence case, no exclamation marks. Exact strings are in the tasks.
- Deploy only the functions changed; never print secrets.

## Review Focus

1. A pass edited by its owner while a live check runs — the live `update(patch)` must not erase the edit (patch only the fields it computed, never a full set).
2. The wallet trigger writing `walletUpdatedAtMs` must not re-fire itself into a loop (Task 5 test: `walletFieldsChanged` ignores it).
3. APNs push without `apns-push-type`: Wallet passes have always been pushed with an empty payload and the pass type as topic; if APNs answers 400 `InvalidPushType` in the device test, add `'apns-push-type': 'background'` and `'apns-priority': '5'`.
4. A Wallet GET for a deleted pass or a pass whose serial isn't `bp-…` → 401, never a 500 (Task 5 test on `passIdFromSerial`).
5. A flight with no `arrivalTime` — only the two pre-departure checks run, never a NaN checkpoint (Task 1 test).

---

### Task 1: When to check (`dueCheckpoint`)

**Files:**
- Modify: `functions/src/flightPolling.ts` (replace `shouldPollFlight` and its doc comment)
- Test: `__tests__/functions/flightPolling.test.ts` (replace the `shouldPollFlight` block)

**Interfaces:**
- Produces: `type Checkpoint = 'before120' | 'before45' | 'afterArrival'`; `dueCheckpoint(departureMs: number, arrivalMs: number | null, nowMs: number, runMinutes?: number): Checkpoint | null`; `LOOKBACK_HOURS = 20`; `LOOKAHEAD_HOURS = 3`.

- [ ] **Step 1: Replace the `shouldPollFlight` tests** (remove `shouldPollFlight` from the import, add `dueCheckpoint`):

```ts
describe('dueCheckpoint', () => {
  const dep = Date.parse('2026-10-15T12:00:00.000Z');
  const arr = Date.parse('2026-10-15T15:00:00.000Z');
  const at = (iso: string) => Date.parse(iso);
  it('checks two hours before departure, in the run that follows that moment', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:00:00.000Z'))).toBe('before120');
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:29:00.000Z'))).toBe('before120');
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:30:00.000Z'))).toBeNull();
  });
  it('checks 45 minutes before departure', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T11:30:00.000Z'))).toBe('before45');
  });
  it('checks 30 minutes after the scheduled arrival', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T15:30:00.000Z'))).toBe('afterArrival');
  });
  it('without an arrival time only the two departure checks run', () => {
    expect(dueCheckpoint(dep, null, at('2026-10-15T15:30:00.000Z'))).toBeNull();
    expect(dueCheckpoint(dep, NaN, at('2026-10-15T15:30:00.000Z'))).toBeNull();
    expect(dueCheckpoint(dep, null, at('2026-10-15T10:00:00.000Z'))).toBe('before120');
  });
  it('spends nothing between checkpoints', () => {
    for (const iso of ['2026-10-15T08:00:00.000Z', '2026-10-15T11:00:00.000Z', '2026-10-15T13:00:00.000Z']) {
      expect(dueCheckpoint(dep, arr, at(iso))).toBeNull();
    }
  });
  it('a full day of half-hourly runs makes exactly three checks', () => {
    let n = 0;
    for (let t = at('2026-10-15T00:00:00.000Z'); t < at('2026-10-16T00:00:00.000Z'); t += 30 * 60_000) {
      if (dueCheckpoint(dep, arr, t)) n += 1;
    }
    expect(n).toBe(3);
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/functions/flightPolling.test.ts` — Expected: FAIL, `dueCheckpoint is not a function`.

- [ ] **Step 3: Implement** — delete `shouldPollFlight` and its comment from `flightPolling.ts`, add:

```ts
/**
 * Which of a flight's three checks (if any) this run should make. AviationStack's free plan is
 * 100 calls a month, so each flight gets three: two hours out (first gate, early delay), 45 minutes
 * out (late gate change, new delay) and 30 minutes after scheduled arrival (landed / cancelled).
 * A checkpoint is due in the one half-hourly run that follows it — derived from the clock, so it
 * costs no Firestore write; a missed run just skips that check.
 */
export type Checkpoint = 'before120' | 'before45' | 'afterArrival';
export const LOOKBACK_HOURS = 20;
export const LOOKAHEAD_HOURS = 3;
const MIN = 60_000;

export function dueCheckpoint(departureMs: number, arrivalMs: number | null, nowMs: number, runMinutes = 30): Checkpoint | null {
  const marks: [Checkpoint, number][] = [['before120', departureMs - 120 * MIN], ['before45', departureMs - 45 * MIN]];
  if (arrivalMs !== null && Number.isFinite(arrivalMs)) marks.push(['afterArrival', arrivalMs + 30 * MIN]);
  for (const [name, at] of marks) if (at <= nowMs && at > nowMs - runMinutes * MIN) return name;
  return null;
}
```

- [ ] **Step 4: Run** `npx jest __tests__/functions/flightPolling.test.ts` — Expected: PASS. (`checkFlightStatus.ts` still imports `shouldPollFlight`; Task 3 rewires it — don't build functions until then.)

- [ ] **Step 5: Commit** `git add functions/src/flightPolling.ts __tests__/functions/flightPolling.test.ts && git commit -m "feat(flights): three checkpoints per flight to fit the free API plan"`

### Task 2: What a check means (`flightLive.ts`)

**Files:**
- Create: `functions/src/flightLive.ts`
- Test: `__tests__/functions/flightLive.test.ts`

**Interfaces:**
- Produces: `LiveFlight`, `LiveResult`, `FlightAlert`, `parseLiveFlight(json: unknown): LiveResult`, `flightChanges(pass: PassState, live: LiveFlight, nowMs: number): { patch: Record<string, unknown>; alerts: FlightAlert[] }`, `alertNotification(alert, passId, flightNumber): { notification: Record<string, unknown>; push: { title: string; body: string } }`, `formatDelay(minutes: number): string`.

- [ ] **Step 1: Write the tests**

```ts
// __tests__/functions/flightLive.test.ts
import { parseLiveFlight, flightChanges, alertNotification, formatDelay, type LiveFlight } from '../../functions/src/flightLive';

const live = (over: Partial<LiveFlight> = {}): LiveFlight => ({ status: 'scheduled', gate: null, terminal: null, delayMinutes: null, departureLocal: null, ...over });
const NOW = 1_760_000_000_000;

describe('parseLiveFlight', () => {
  it('reads gate, terminal, delay and the local clock time', () => {
    const r = parseLiveFlight({ data: [{ flight_status: 'scheduled', departure: { gate: 'B22', terminal: '2', delay: 45, estimated: '2026-10-23T14:35:00+00:00' } }] });
    expect(r).toEqual({ kind: 'flight', flight: { status: 'scheduled', gate: 'B22', terminal: '2', delayMinutes: 45, departureLocal: '14:35' } });
  });
  it('no flight found', () => {
    expect(parseLiveFlight({ data: [] })).toEqual({ kind: 'none' });
  });
  it('spots the monthly limit', () => {
    expect(parseLiveFlight({ error: { code: 'usage_limit_reached', message: 'x' } })).toEqual({ kind: 'limit', code: 'usage_limit_reached' });
  });
  it('other errors are just no answer', () => {
    expect(parseLiveFlight({ error: { code: 'invalid_access_key' } })).toEqual({ kind: 'error', code: 'invalid_access_key' });
    expect(parseLiveFlight(null)).toEqual({ kind: 'none' });
  });
});

describe('flightChanges', () => {
  it('a new gate alerts and is saved as live', () => {
    const r = flightChanges({ status: 'upcoming', gate: 'B3' }, live({ gate: 'B22' }), NOW);
    expect(r.patch).toMatchObject({ gate: 'B22', gateSource: 'live', liveCheckedAtMs: NOW });
    expect(r.alerts).toEqual([{ kind: 'gate', gate: 'B22' }]);
  });
  it('the same gate in other case is not a change', () => {
    expect(flightChanges({ status: 'upcoming', gate: 'b22' }, live({ gate: 'B22' }), NOW).alerts).toEqual([]);
  });
  it('a gate appearing where none was saved alerts too', () => {
    expect(flightChanges({ status: 'upcoming' }, live({ gate: 'C4' }), NOW).alerts).toEqual([{ kind: 'gate', gate: 'C4' }]);
  });
  it('a terminal change is saved without an alert', () => {
    const r = flightChanges({ status: 'upcoming', terminal: '1' }, live({ terminal: '2' }), NOW);
    expect(r.patch.terminal).toBe('2');
    expect(r.alerts).toEqual([]);
  });
  it('delays alert from 15 minutes, then every further 15', () => {
    expect(flightChanges({ status: 'upcoming' }, live({ delayMinutes: 10 }), NOW).alerts).toEqual([]);
    const first = flightChanges({ status: 'upcoming' }, live({ delayMinutes: 20, departureLocal: '14:35' }), NOW);
    expect(first.alerts).toEqual([{ kind: 'delay', minutes: 20, departureLocal: '14:35' }]);
    expect(first.patch).toMatchObject({ delayMinutes: 20, liveDepartureLocal: '14:35', delayAlertedMinutes: 20 });
    expect(flightChanges({ status: 'upcoming', delayAlertedMinutes: 20 }, live({ delayMinutes: 30 }), NOW).alerts).toEqual([]);
    expect(flightChanges({ status: 'upcoming', delayAlertedMinutes: 20 }, live({ delayMinutes: 35 }), NOW).alerts).toHaveLength(1);
  });
  it('airborne becomes boarded with no alert', () => {
    const r = flightChanges({ status: 'upcoming', gate: 'B3' }, live({ status: 'active', gate: 'B9' }), NOW);
    expect(r.patch.status).toBe('boarded');
    expect(r.alerts).toEqual([]);
  });
  it('landed and cancelled alert once', () => {
    expect(flightChanges({ status: 'boarded' }, live({ status: 'landed' }), NOW)).toEqual({ patch: { liveCheckedAtMs: NOW, status: 'completed' }, alerts: [{ kind: 'landed' }] });
    expect(flightChanges({ status: 'upcoming' }, live({ status: 'cancelled', gate: 'B22' }), NOW).alerts).toEqual([{ kind: 'cancelled' }]);
    expect(flightChanges({ status: 'cancelled' }, live({ status: 'cancelled' }), NOW).alerts).toEqual([]);
  });
  it('nothing new means only the checked-at stamp', () => {
    expect(flightChanges({ status: 'upcoming', gate: 'B3' }, live({ gate: 'B3' }), NOW)).toEqual({ patch: { liveCheckedAtMs: NOW }, alerts: [] });
  });
});

describe('alertNotification', () => {
  it('gate', () => {
    expect(alertNotification({ kind: 'gate', gate: 'B22' }, 'p1', 'KL1357')).toEqual({
      notification: { type: 'flight_change', passId: 'p1', flightNumber: 'KL1357', change: 'gate', gate: 'B22' },
      push: { title: 'Gate change · KL1357', body: 'Now departing from gate B22.' },
    });
  });
  it('delay, with and without the new time', () => {
    expect(alertNotification({ kind: 'delay', minutes: 45, departureLocal: '14:35' }, 'p1', 'KL1357').push)
      .toEqual({ title: 'KL1357 is delayed', body: 'About 45 min late — now departing 14:35.' });
    expect(alertNotification({ kind: 'delay', minutes: 80, departureLocal: null }, 'p1', 'KL1357').push.body).toBe('About 1 h 20 min late.');
  });
  it('landed and cancelled keep the flight_status type older apps know', () => {
    expect(alertNotification({ kind: 'landed' }, 'p1', 'KL1357')).toEqual({
      notification: { type: 'flight_status', passId: 'p1', flightNumber: 'KL1357', status: 'completed' },
      push: { title: 'Flight update', body: 'KL1357 has landed.' },
    });
    expect(alertNotification({ kind: 'cancelled' }, 'p1', 'KL1357').notification.status).toBe('cancelled');
  });
});

describe('formatDelay', () => {
  it('minutes, hours, both', () => {
    expect(formatDelay(45)).toBe('45 min');
    expect(formatDelay(60)).toBe('1 h');
    expect(formatDelay(135)).toBe('2 h 15 min');
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/functions/flightLive.test.ts` — Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement** `functions/src/flightLive.ts`:

```ts
/**
 * What one AviationStack answer means for a boarding pass (spec 2026-10-23 §2). Pure: no firebase-admin.
 * AviationStack prints the airport's local clock behind a "+00:00" label, so only the HH:MM text is kept.
 */
export type LiveFlight = { status: string | null; gate: string | null; terminal: string | null; delayMinutes: number | null; departureLocal: string | null };
export type LiveResult = { kind: 'flight'; flight: LiveFlight } | { kind: 'none' } | { kind: 'limit'; code: string } | { kind: 'error'; code: string };
export type FlightAlert =
  | { kind: 'gate'; gate: string }
  | { kind: 'delay'; minutes: number; departureLocal: string | null }
  | { kind: 'landed' }
  | { kind: 'cancelled' };
export type PassState = { status?: string; gate?: string; terminal?: string; delayAlertedMinutes?: number };

const LIMIT_CODES = new Set(['usage_limit_reached', 'monthly_limit_reached']);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

export function parseLiveFlight(json: unknown): LiveResult {
  const body = (json ?? {}) as { data?: unknown[]; error?: { code?: unknown } };
  if (body.error) {
    const code = str(body.error.code) ?? 'unknown';
    return LIMIT_CODES.has(code) ? { kind: 'limit', code } : { kind: 'error', code };
  }
  const f = (Array.isArray(body.data) ? body.data[0] : null) as Record<string, any> | null;
  if (!f) return { kind: 'none' };
  const dep = (f.departure ?? {}) as Record<string, unknown>;
  const clock = str(dep.estimated)?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
  const delay = typeof dep.delay === 'number' && Number.isFinite(dep.delay) ? Math.round(dep.delay) : null;
  return { kind: 'flight', flight: { status: str(f.flight_status), gate: str(dep.gate), terminal: str(dep.terminal), delayMinutes: delay, departureLocal: clock } };
}

export function flightChanges(pass: PassState, live: LiveFlight, nowMs: number): { patch: Record<string, unknown>; alerts: FlightAlert[] } {
  const patch: Record<string, unknown> = { liveCheckedAtMs: nowMs };
  const alerts: FlightAlert[] = [];
  if (live.status === 'cancelled') {
    if (pass.status !== 'cancelled') { patch.status = 'cancelled'; alerts.push({ kind: 'cancelled' }); }
    return { patch, alerts };
  }
  if (live.status === 'landed') {
    if (pass.status !== 'completed') { patch.status = 'completed'; alerts.push({ kind: 'landed' }); }
    return { patch, alerts };
  }
  let status = pass.status;
  if (live.status === 'active' && pass.status === 'upcoming') { patch.status = 'boarded'; status = 'boarded'; }
  const onGround = status === 'upcoming';
  if (live.gate && norm(live.gate) !== norm(pass.gate)) {
    patch.gate = live.gate;
    patch.gateSource = 'live';
    if (onGround) alerts.push({ kind: 'gate', gate: live.gate });
  }
  if (live.terminal && norm(live.terminal) !== norm(pass.terminal)) patch.terminal = live.terminal;
  if (live.delayMinutes !== null) {
    patch.delayMinutes = live.delayMinutes;
    if (live.departureLocal) patch.liveDepartureLocal = live.departureLocal;
    if (onGround && live.delayMinutes >= 15 && live.delayMinutes >= (pass.delayAlertedMinutes ?? 0) + 15) {
      patch.delayAlertedMinutes = live.delayMinutes;
      alerts.push({ kind: 'delay', minutes: live.delayMinutes, departureLocal: live.departureLocal });
    }
  }
  return { patch, alerts };
}

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function alertNotification(alert: FlightAlert, passId: string, flightNumber: string) {
  const base = { passId, flightNumber };
  switch (alert.kind) {
    case 'gate':
      return { notification: { type: 'flight_change', ...base, change: 'gate', gate: alert.gate },
        push: { title: `Gate change · ${flightNumber}`, body: `Now departing from gate ${alert.gate}.` } };
    case 'delay':
      return { notification: { type: 'flight_change', ...base, change: 'delay', delayMinutes: alert.minutes },
        push: { title: `${flightNumber} is delayed`, body: `About ${formatDelay(alert.minutes)} late${alert.departureLocal ? ` — now departing ${alert.departureLocal}` : ''}.` } };
    case 'landed':
      return { notification: { type: 'flight_status', ...base, status: 'completed' }, push: { title: 'Flight update', body: `${flightNumber} has landed.` } };
    case 'cancelled':
      return { notification: { type: 'flight_status', ...base, status: 'cancelled' }, push: { title: 'Flight update', body: `${flightNumber} has been cancelled.` } };
  }
}
```

Note the delay test's `toEqual` on the notification for gate is exact; the delay notification carries `delayMinutes` (not asserted there).

- [ ] **Step 4: Run** `npx jest __tests__/functions/flightLive.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `git add functions/src/flightLive.ts __tests__/functions/flightLive.test.ts && git commit -m "feat(flights): read gate, delay and status changes from a live check"`

### Task 3: Wire the checker (`checkFlightStatus.ts`)

**Files:**
- Modify: `functions/src/checkFlightStatus.ts` (whole file)

**Interfaces:**
- Consumes: `dueCheckpoint`, `LOOKBACK_HOURS`, `LOOKAHEAD_HOURS`, `filterPassesForPaidOwners`, `groupPassesByFlight` (Task 1 / existing); `parseLiveFlight`, `flightChanges`, `alertNotification` (Task 2); `notifyUser` (existing).

- [ ] **Step 1: Replace the file** with:

```ts
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { notifyUser } from './notify';
import { dueCheckpoint, filterPassesForPaidOwners, groupPassesByFlight, LOOKAHEAD_HOURS, LOOKBACK_HOURS } from './flightPolling';
import { alertNotification, flightChanges, parseLiveFlight, type LiveResult } from './flightLive';

const db = admin.firestore();
const HOUR = 3_600_000;

// AviationStack (free plan: HTTP only, 100 calls a month — spec 2026-10-23).
function fetchLiveFlight(flightNumber: string, date: string): Promise<LiveResult> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) return Promise.resolve({ kind: 'none' });
  const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightNumber)}&flight_date=${date}`;
  return new Promise((resolve) => {
    const http = require('http');
    http.get(url, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(parseLiveFlight(JSON.parse(data))); } catch { resolve({ kind: 'none' }); }
      });
    }).on('error', () => resolve({ kind: 'none' }));
  });
}

/**
 * Every 30 minutes: Pro users' flights from 20 h ago to 3 h ahead, each checked at most three times
 * (flightPolling.dueCheckpoint), one call per real flight. Gate, delay, landed and cancelled changes are
 * saved on the pass (which also updates its Apple Wallet copy, appleWalletServiceFunctions.ts) and sent
 * with notifyUser.
 */
export const checkFlightStatus = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', memory: '256MiB' },
  async () => {
    const nowMs = Date.now();
    const snap = await db
      .collection('boarding_passes')
      .where('status', 'in', ['upcoming', 'boarded'])
      .where('departureTime', '>=', new Date(nowMs - LOOKBACK_HOURS * HOUR).toISOString())
      .where('departureTime', '<=', new Date(nowMs + LOOKAHEAD_HOURS * HOUR).toISOString())
      .get();

    const candidates = snap.docs.map((doc) => ({
      doc,
      ownerUid: doc.data().ownerUid as string,
      flightNumber: doc.data().flightNumber as string,
      departureTime: doc.data().departureTime as string,
      arrivalTime: doc.data().arrivalTime as string | undefined,
    })).filter((c) => c.flightNumber && c.departureTime);

    // Pro only, decided before anything is spent (one getAll for the distinct owners).
    const ownerUids = [...new Set(candidates.map((c) => c.ownerUid).filter(Boolean))];
    const tierByUid = new Map<string, string | undefined>();
    if (ownerUids.length > 0) {
      const userDocs = await db.getAll(...ownerUids.map((uid) => db.collection('users').doc(uid)));
      for (const userDoc of userDocs) tierByUid.set(userDoc.id, userDoc.data()?.tier as string | undefined);
    }
    const due = groupPassesByFlight(filterPassesForPaidOwners(candidates, tierByUid)).filter((group) => {
      const first = group.passes[0];
      const arrivalMs = first.arrivalTime ? Date.parse(first.arrivalTime) : null;
      return dueCheckpoint(Date.parse(first.departureTime), arrivalMs, nowMs) !== null;
    });

    for (const group of due) {
      const result = await fetchLiveFlight(group.flightNumber, group.departureDate);
      if (result.kind === 'limit') {
        console.warn('[checkFlightStatus] AviationStack monthly limit reached; no more checks this month', { code: result.code });
        break;
      }
      if (result.kind === 'error') console.warn('[checkFlightStatus] AviationStack error', { code: result.code });
      if (result.kind !== 'flight') continue;
      for (const { doc } of group.passes) {
        const pass = doc.data();
        const { patch, alerts } = flightChanges(pass, result.flight, Date.now());
        // update(), never set(): an edit the owner made a moment ago keeps every field this check didn't compute.
        await doc.ref.update(patch);
        for (const alert of alerts) await notifyUser(pass.ownerUid, alertNotification(alert, doc.id, pass.flightNumber));
      }
    }
  },
);
```

- [ ] **Step 2: Build** `cd functions && npm run build` — Expected: `tsc` with no errors.

- [ ] **Step 3: Full suite** `npx jest 2>&1 | tail -5` — Expected: all pass.

- [ ] **Step 4: Commit** `git add functions/src/checkFlightStatus.ts && git commit -m "feat(flights): gate, delay and landing alerts on three checks per flight"`

### Task 4: App side — `flight_change` and honest copy

**Files:**
- Modify: `utils/notificationRoute.ts` (ROUTES), `types/index.ts` (notification types), `app/notifications.tsx` (row + `FLIGHT_STATUS_COPY`), `app/notification-intro.tsx:16`, `constants/icons.ts:74`
- Test: `__tests__/utils/notificationRoute.test.ts`

**Interfaces:**
- Produces: `FlightChangeNotification { id; type: 'flight_change'; passId; flightNumber; change: 'gate' | 'delay'; gate?: string; delayMinutes?: number; read; createdAt }` in `AppNotification`.

- [ ] **Step 1: Test** — add to `resolveNotificationRoute`:

```ts
  it('sends a gate change or delay to the boarding pass', () => {
    expect(resolveNotificationRoute({ type: 'flight_change', passId: 'bp1' })).toBe('/(wallet)/boarding-pass/bp1');
  });
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/notificationRoute.test.ts` — Expected: FAIL (null).

- [ ] **Step 3: Implement**
  - `utils/notificationRoute.ts`, after `flight_status`: `flight_change: { idKey: 'passId', build: (id) => \`/(wallet)/boarding-pass/${id}\` },`
  - `types/index.ts`, after `FlightStatusNotification`:

```ts
/** A gate change or delay found by checkFlightStatus (spec 2026-10-23). Older apps show it from its saved title/body. */
export interface FlightChangeNotification {
  id: string;
  type: 'flight_change';
  passId: string;
  flightNumber: string;
  change: 'gate' | 'delay';
  gate?: string;
  delayMinutes?: number;
  read: boolean;
  createdAt: Timestamp;
}
```
  and add `| FlightChangeNotification` to `AppNotification`.
  - `app/notifications.tsx`: `FLIGHT_STATUS_COPY.boarded` → `'has taken off'`; change `if (item.type === 'flight_status') {` to `if (item.type === 'flight_status' || item.type === 'flight_change') {` and the copy expression to:

```tsx
{item.type === 'flight_change'
  ? (item.change === 'gate' && item.gate ? `moved to gate ${item.gate}` : 'is delayed')
  : (FLIGHT_STATUS_COPY[item.status] ?? 'has an update')}
```
  - `app/notification-intro.tsx:16` body → `'Gate changes, delays, landing and cancellations (Pro).'`
  - `constants/icons.ts:74` description → `'Gate, delay, landing and cancellation alerts'`

- [ ] **Step 4: Run** `npx jest __tests__/utils/notificationRoute.test.ts && npx tsc --noEmit -p . && npx eslint app/notifications.tsx utils/notificationRoute.ts` — Expected: pass, no type or lint errors.

- [ ] **Step 5: Commit** `git add utils/notificationRoute.ts types/index.ts app/notifications.tsx app/notification-intro.tsx constants/icons.ts __tests__/utils/notificationRoute.test.ts && git commit -m "feat(app): gate change and delay notifications; flight alert copy says what it does"`

### Task 5: Live pass contents and Wallet web-service rules (pure)

**Files:**
- Modify: `functions/src/applePass.ts`, `functions/src/walletLink.ts`, `functions/src/applePassSign.ts`
- Create: `functions/src/appleWalletService.ts`
- Test: `__tests__/functions/applePass.test.ts`, `__tests__/functions/walletLink.test.ts`, `__tests__/functions/appleWalletService.test.ts`

**Interfaces:**
- Consumes: `formatDelay` (Task 2).
- Produces: `passJson(p: PassInput, web?: { webServiceURL: string; authenticationToken: string })`; `PassInput` gains `status?`, `delayMinutes?`, `liveDepartureLocal?`, `liveCheckedAtMs?`; `statusLine(p: PassInput): string | null`; `walletAuthToken(serial: string, secret: string): string`; `buildSignedPass(pass, certs, imgs?, web?)`; in `appleWalletService.ts`: `WALLET_SERVICE_URL`, `WalletRoute`, `parseWalletServicePath(method: string, path: string): WalletRoute | null`, `passIdFromSerial(serial: string): string | null`, `tokenFromAuthHeader(h: string | undefined): string | null`, `walletFieldsChanged(before, after): boolean`, `serialsUpdatedSince(rows: { serial: string; updatedAtMs: number }[], since: string | undefined): { serialNumbers: string[]; lastUpdated: string } | null`.

- [ ] **Step 1: Tests.** Append to `__tests__/functions/applePass.test.ts`:

```ts
import { statusLine } from '../../functions/src/applePass';

describe('live pass', () => {
  const web = { webServiceURL: 'https://example.test/ws', authenticationToken: 'tok-0123456789abcdef' };
  it('carries the update address and token only when given', () => {
    expect(passJson(full, web)).toMatchObject(web);
    expect(passJson(full).webServiceURL).toBeUndefined();
  });
  it('announces gate and time changes on the lock screen', () => {
    const j = passJson(full, web) as Record<string, any>;
    expect(j.boardingPass.headerFields[0].changeMessage).toBe('Gate changed to %@');
    expect(fields(j, 'secondaryFields').find((f) => f.key === 'departs')).toMatchObject({ changeMessage: 'Now departs %@' });
  });
  it('a STATUS line once the flight has been checked', () => {
    expect(keys(passJson(full), 'secondaryFields')).not.toContain('status');
    const j = passJson({ ...full, liveCheckedAtMs: 1 }) as Record<string, any>;
    expect(fields(j, 'secondaryFields').find((f) => f.key === 'status')).toMatchObject({ value: 'On time', changeMessage: '%@' });
  });
  it('statusLine', () => {
    expect(statusLine({ id: 'p', status: 'cancelled' })).toBe('Cancelled');
    expect(statusLine({ id: 'p', status: 'completed' })).toBe('Landed');
    expect(statusLine({ id: 'p', delayMinutes: 45, liveDepartureLocal: '14:35' })).toBe('Delayed 45 min · 14:35');
    expect(statusLine({ id: 'p', delayMinutes: 80 })).toBe('Delayed 1 h 20 min');
    expect(statusLine({ id: 'p', delayMinutes: 5, liveCheckedAtMs: 1 })).toBe('On time');
    expect(statusLine({ id: 'p' })).toBeNull();
  });
});
```

Append to `__tests__/functions/walletLink.test.ts` (add `walletAuthToken` to the import):

```ts
describe('walletAuthToken', () => {
  it('is stable per serial, differs between serials and secrets, and is long enough for Wallet', () => {
    const a = walletAuthToken('bp-1', S);
    expect(walletAuthToken('bp-1', S)).toBe(a);
    expect(walletAuthToken('bp-2', S)).not.toBe(a);
    expect(walletAuthToken('bp-1', S + 'x')).not.toBe(a);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});
```

Create `__tests__/functions/appleWalletService.test.ts`:

```ts
import { parseWalletServicePath, passIdFromSerial, tokenFromAuthHeader, walletFieldsChanged, serialsUpdatedSince } from '../../functions/src/appleWalletService';

const PT = 'pass.com.supernovatravel.app';
describe('parseWalletServicePath', () => {
  it('register and unregister', () => {
    expect(parseWalletServicePath('POST', `/v1/devices/dev1/registrations/${PT}/bp-1`)).toEqual({ kind: 'register', device: 'dev1', passType: PT, serial: 'bp-1' });
    expect(parseWalletServicePath('DELETE', `/v1/devices/dev1/registrations/${PT}/bp-1`)).toEqual({ kind: 'unregister', device: 'dev1', passType: PT, serial: 'bp-1' });
  });
  it('serials for a device, the latest pass, and logs', () => {
    expect(parseWalletServicePath('GET', `/v1/devices/dev1/registrations/${PT}`)).toEqual({ kind: 'serials', device: 'dev1', passType: PT });
    expect(parseWalletServicePath('GET', `/v1/passes/${PT}/bp-1`)).toEqual({ kind: 'pass', passType: PT, serial: 'bp-1' });
    expect(parseWalletServicePath('POST', '/v1/log')).toEqual({ kind: 'log' });
  });
  it('anything else is not ours', () => {
    expect(parseWalletServicePath('GET', '/v1/devices/dev1')).toBeNull();
    expect(parseWalletServicePath('PUT', `/v1/passes/${PT}/bp-1`)).toBeNull();
    expect(parseWalletServicePath('GET', '/')).toBeNull();
  });
});

describe('helpers', () => {
  it('passIdFromSerial', () => {
    expect(passIdFromSerial('bp-abc')).toBe('abc');
    expect(passIdFromSerial('abc')).toBeNull();
    expect(passIdFromSerial('bp-')).toBeNull();
    expect(passIdFromSerial('bp-a/b')).toBeNull();
  });
  it('tokenFromAuthHeader', () => {
    expect(tokenFromAuthHeader('ApplePass tok123')).toBe('tok123');
    expect(tokenFromAuthHeader('Bearer tok123')).toBeNull();
    expect(tokenFromAuthHeader(undefined)).toBeNull();
  });
});

describe('walletFieldsChanged', () => {
  const pass = { flightNumber: 'KL1357', gate: 'B3', seat: '14A', status: 'upcoming' };
  it('a field shown on the pass', () => {
    expect(walletFieldsChanged(pass, { ...pass, gate: 'B22' })).toBe(true);
    expect(walletFieldsChanged(pass, { ...pass, delayMinutes: 30 })).toBe(true);
    expect(walletFieldsChanged(pass, { ...pass, liveCheckedAtMs: 5 })).toBe(true);
  });
  it('not for fields Wallet never shows, nor its own stamp (no loop)', () => {
    expect(walletFieldsChanged(pass, { ...pass, notes: 'x', tripId: 't' })).toBe(false);
    expect(walletFieldsChanged(pass, { ...pass, walletUpdatedAtMs: 9 })).toBe(false);
    expect(walletFieldsChanged({ ...pass, liveCheckedAtMs: 5 }, { ...pass, liveCheckedAtMs: 6 })).toBe(false);
  });
  it('a new pass has no Wallet copy yet', () => {
    expect(walletFieldsChanged(null, pass)).toBe(false);
  });
});

describe('serialsUpdatedSince', () => {
  const rows = [{ serial: 'bp-1', updatedAtMs: 100 }, { serial: 'bp-2', updatedAtMs: 300 }];
  it('everything when Wallet has no tag yet', () => {
    expect(serialsUpdatedSince(rows, undefined)).toEqual({ serialNumbers: ['bp-1', 'bp-2'], lastUpdated: '300' });
  });
  it('only what changed after the tag', () => {
    expect(serialsUpdatedSince(rows, '100')).toEqual({ serialNumbers: ['bp-2'], lastUpdated: '300' });
  });
  it('nothing new → null (204)', () => {
    expect(serialsUpdatedSince(rows, '300')).toBeNull();
    expect(serialsUpdatedSince([], undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/functions/applePass.test.ts __tests__/functions/walletLink.test.ts __tests__/functions/appleWalletService.test.ts` — Expected: FAIL (missing exports/module).

- [ ] **Step 3: Implement.**

`functions/src/applePass.ts`: add `import { formatDelay } from './flightLive';`; extend `PassInput` with `status?: string; delayMinutes?: number; liveDepartureLocal?: string; liveCheckedAtMs?: number;`; add

```ts
/** The pass's STATUS line (spec 2026-10-23 §3); null until the flight has been checked live. */
export function statusLine(p: PassInput): string | null {
  if (p.status === 'cancelled') return 'Cancelled';
  if (p.status === 'completed') return 'Landed';
  if (typeof p.delayMinutes === 'number' && p.delayMinutes >= 15) {
    return `Delayed ${formatDelay(p.delayMinutes)}${text(p.liveDepartureLocal) ? ` · ${text(p.liveDepartureLocal)}` : ''}`;
  }
  return p.liveCheckedAtMs ? 'On time' : null;
}
```

change the signature to `export function passJson(p: PassInput, web?: { webServiceURL: string; authenticationToken: string }): Record<string, unknown>`; in it: the `departs` field gets `changeMessage: 'Now departs %@'` (build it as `{ ...time('departs', 'DEPARTS', dep), changeMessage: 'Now departs %@' }`); after the seat/group pushes add `const status = statusLine(p); if (status) secondary.push({ key: 'status', label: 'STATUS', value: status, changeMessage: '%@' });`; the header gate field becomes `{ key: 'gate', label: 'GATE', value: text(p.gate) ?? '—', changeMessage: 'Gate changed to %@' }`; before `return json;` add `if (web) Object.assign(json, web);`.

`functions/src/walletLink.ts` — add (it already has `import { createHmac, timingSafeEqual } from 'crypto';`):

```ts
/** Wallet's per-pass authenticationToken (spec 2026-10-23 §3): derived, so nothing is stored. */
export function walletAuthToken(serial: string, secret: string): string {
  return createHmac('sha256', secret).update(`wallet-auth:${serial}`).digest('base64url');
}
```

`functions/src/applePassSign.ts` — `buildSignedPass(pass, certs, imgs = passImages(), web?: { webServiceURL: string; authenticationToken: string })` and `passJson(pass, web)`.

`functions/src/appleWalletService.ts`:

```ts
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
```

- [ ] **Step 4: Run** the three suites again — Expected: PASS. Then `cd functions && npm run build` — Expected: clean.

- [ ] **Step 5: Commit** `git add functions/src/applePass.ts functions/src/walletLink.ts functions/src/applePassSign.ts functions/src/appleWalletService.ts __tests__/functions/applePass.test.ts __tests__/functions/walletLink.test.ts __tests__/functions/appleWalletService.test.ts && git commit -m "feat(wallet): live pass fields and PassKit web-service rules"`

### Task 6: Wallet web service, APNs push, cleanup (wiring)

**Files:**
- Create: `functions/src/apns.ts`, `functions/src/appleWalletServiceFunctions.ts`
- Modify: `functions/src/appleWalletFunctions.ts` (export the secrets; pass `web` when signing), `functions/src/index.ts`, `functions/src/deleteAccount.ts`, `firestore.rules`

**Interfaces:**
- Consumes: everything from Task 5; `PASS_TYPE_ID` (`applePass.ts`); secrets `PASSKIT_KEY`, `PASSKIT_CERT`, `PASSKIT_WWDR`, `WALLET_LINK_SECRET`.
- Produces: exported functions `appleWalletService`, `onBoardingPassWrittenWallet`; `pushPassUpdates(tokens: string[], creds: { cert: string; key: string }): Promise<string[]>` (returns tokens APNs says are gone).

- [ ] **Step 1: `functions/src/apns.ts`**

```ts
/**
 * Tells Apple Wallet a pass changed (spec 2026-10-23 §3): an empty JSON payload per device push token, topic = the
 * pass type id, over HTTP/2 with the pass certificate. Returns the tokens APNs says are gone (410, or 400
 * BadDeviceToken) so their registrations can be dropped.
 */
import * as http2 from 'http2';
import { PASS_TYPE_ID } from './applePass';

export async function pushPassUpdates(tokens: string[], creds: { cert: string; key: string }): Promise<string[]> {
  if (tokens.length === 0) return [];
  const session = http2.connect('https://api.push.apple.com', { cert: creds.cert, key: creds.key });
  const gone: string[] = [];
  try {
    await Promise.all(tokens.map((token) => new Promise<void>((resolve) => {
      const req = session.request({ ':method': 'POST', ':path': `/3/device/${token}`, 'apns-topic': PASS_TYPE_ID, 'content-type': 'application/json' });
      let status = 0; let body = '';
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (status === 410 || (status === 400 && body.includes('BadDeviceToken'))) gone.push(token);
        else if (status !== 200) console.warn('[apns] pass push failed', { status, body: body.slice(0, 200) });
        resolve();
      });
      req.on('error', (e) => { console.warn('[apns] request error', e.message); resolve(); });
      req.end('{}');
    })));
  } finally {
    session.close();
  }
  return gone;
}
```

- [ ] **Step 2: `functions/src/appleWalletFunctions.ts`** — change the four `const X = defineSecret(...)` to `export const`; add `import { walletAuthToken } from './walletLink';` and `import { WALLET_SERVICE_URL } from './appleWalletService';`; in `appleWalletPass` pass a 4th argument to `buildSignedPass`: `undefined` for imgs and `{ webServiceURL: WALLET_SERVICE_URL, authenticationToken: walletAuthToken(\`bp-${snap.id}\`, WALLET_LINK_SECRET.value()) }` as `web` — i.e. `buildSignedPass(input, certs, undefined, web)`.

- [ ] **Step 3: `functions/src/appleWalletServiceFunctions.ts`**

```ts
/**
 * Apple Wallet live passes (spec 2026-10-23 §3). appleWalletService is the PassKit web service Wallet calls
 * (registrations, "what changed", the latest pass, logs); onBoardingPassWrittenWallet stamps walletUpdatedAtMs and
 * pushes Wallet when a field shown on the pass changes. Registrations live at
 * appleWalletRegistrations/{device}__{serial} (server only; removed with the pass and by deleteAccount).
 */
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { PASS_TYPE_ID, type PassInput } from './applePass';
import { buildSignedPass } from './applePassSign';
import { walletAuthToken } from './walletLink';
import { pushPassUpdates } from './apns';
import { PASSKIT_CERT, PASSKIT_KEY, PASSKIT_WWDR, WALLET_LINK_SECRET } from './appleWalletFunctions';
import { parseWalletServicePath, passIdFromSerial, serialsUpdatedSince, tokenFromAuthHeader, walletFieldsChanged, WALLET_SERVICE_URL } from './appleWalletService';

const db = admin.firestore();
const REGS = 'appleWalletRegistrations';

export const appleWalletService = onRequest(
  { region: 'us-central1', invoker: 'public', secrets: [PASSKIT_KEY, PASSKIT_CERT, PASSKIT_WWDR, WALLET_LINK_SECRET] },
  async (req, res) => {
    const route = parseWalletServicePath(req.method, req.path);
    if (!route) { res.status(404).send(''); return; }
    if (route.kind === 'log') { console.log('[appleWalletService] wallet log', JSON.stringify(req.body?.logs ?? []).slice(0, 2000)); res.status(200).send(''); return; }
    if (route.passType !== PASS_TYPE_ID) { res.status(401).send(''); return; }

    if (route.kind === 'serials') {
      const regs = await db.collection(REGS).where('device', '==', route.device).get();
      const ids = regs.docs.map((d) => passIdFromSerial(String(d.get('serial')))).filter((x): x is string => !!x);
      const passes = ids.length ? await db.getAll(...ids.map((id) => db.doc(`boarding_passes/${id}`))) : [];
      const rows = passes.filter((p) => p.exists).map((p) => ({ serial: `bp-${p.id}`, updatedAtMs: Number(p.get('walletUpdatedAtMs') ?? 0) }));
      const answer = serialsUpdatedSince(rows, typeof req.query.passesUpdatedSince === 'string' ? req.query.passesUpdatedSince : undefined);
      if (!answer) { res.status(204).send(''); return; }
      res.status(200).json(answer); return;
    }

    // Every other route is about one pass and carries its token.
    const passId = passIdFromSerial(route.serial);
    const token = tokenFromAuthHeader(req.get('Authorization'));
    if (!passId || !token || token !== walletAuthToken(route.serial, WALLET_LINK_SECRET.value())) { res.status(401).send(''); return; }
    const snap = await db.doc(`boarding_passes/${passId}`).get();
    const regRef = (device: string) => db.doc(`${REGS}/${device}__${route.serial}`);

    if (route.kind === 'unregister') { await regRef(route.device).delete(); res.status(200).send(''); return; }
    if (!snap.exists) { res.status(401).send(''); return; }

    if (route.kind === 'register') {
      const pushToken = typeof req.body?.pushToken === 'string' ? req.body.pushToken : null;
      if (!pushToken) { res.status(400).send(''); return; }
      const ref = regRef(route.device);
      const existed = (await ref.get()).exists;
      await ref.set({ device: route.device, pushToken, serial: route.serial, passId, ownerUid: snap.get('ownerUid'), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      res.status(existed ? 200 : 201).send(''); return;
    }

    // route.kind === 'pass': the latest copy, or 304 when Wallet already has it.
    const updatedMs = Number(snap.get('walletUpdatedAtMs') ?? snap.updateTime?.toMillis() ?? Date.now());
    const lastModified = new Date(Math.floor(updatedMs / 1000) * 1000);
    const since = Date.parse(req.get('If-Modified-Since') ?? '');
    if (Number.isFinite(since) && since >= lastModified.getTime()) { res.status(304).send(''); return; }
    try {
      const file = buildSignedPass({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) },
        { signerKey: PASSKIT_KEY.value(), signerCert: PASSKIT_CERT.value(), wwdr: PASSKIT_WWDR.value() },
        undefined, { webServiceURL: WALLET_SERVICE_URL, authenticationToken: token });
      res.set('Content-Type', 'application/vnd.apple.pkpass');
      res.set('Last-Modified', lastModified.toUTCString());
      res.set('Cache-Control', 'no-store');
      res.status(200).send(file);
    } catch (e) {
      console.error('[appleWalletService] signing failed:', (e as Error).message);
      res.status(500).send('');
    }
  },
);

export const onBoardingPassWrittenWallet = onDocumentWritten(
  { document: 'boarding_passes/{passId}', region: 'us-central1', secrets: [PASSKIT_KEY, PASSKIT_CERT] },
  async (event) => {
    const serial = `bp-${event.params.passId}`;
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    const regs = await db.collection(REGS).where('serial', '==', serial).get();
    if (!after) { await Promise.all(regs.docs.map((d) => d.ref.delete())); return; }
    if (!walletFieldsChanged(before, after)) return;
    await event.data!.after.ref.update({ walletUpdatedAtMs: Date.now() });
    if (regs.empty) return;
    const gone = await pushPassUpdates(regs.docs.map((d) => String(d.get('pushToken'))), { cert: PASSKIT_CERT.value(), key: PASSKIT_KEY.value() });
    await Promise.all(regs.docs.filter((d) => gone.includes(String(d.get('pushToken')))).map((d) => d.ref.delete()));
  },
);
```

Note: the `walletUpdatedAtMs` update re-fires the trigger; `walletFieldsChanged` ignores that field, so the second run returns early.

- [ ] **Step 4: Exports, rules, account deletion**
  - `functions/src/index.ts`: after the `appleWalletLink` export add `export { appleWalletService, onBoardingPassWrittenWallet } from './appleWalletServiceFunctions';`
  - `firestore.rules`, after the `androidGifts` match:

```
    // Apple Wallet live passes (functions/src/appleWalletServiceFunctions.ts): server only.
    match /appleWalletRegistrations/{id} {
      allow read, write: if false;
    }
```
  - `functions/src/deleteAccount.ts`, after the calendar feeds block:

```ts
  // Apple Wallet registrations for their passes (appleWalletServiceFunctions.ts).
  const walletRegs = await db.collection('appleWalletRegistrations').where('ownerUid', '==', uid).get();
  await Promise.all(walletRegs.docs.map((d) => d.ref.delete()));
```

- [ ] **Step 5: Build and test** `(cd functions && npm run build) && npx jest 2>&1 | tail -4 && node scripts/check-apple-pass.mjs` — Expected: clean build; all tests pass; the local signature check still prints OK.

- [ ] **Step 6: Commit** `git add functions/src/apns.ts functions/src/appleWalletServiceFunctions.ts functions/src/appleWalletFunctions.ts functions/src/index.ts functions/src/deleteAccount.ts firestore.rules && git commit -m "feat(wallet): PassKit web service and pushes so Wallet passes update themselves"`

### Task 7: Docs, privacy, deploy, live checks

**Files:**
- Modify: `hosting/privacy.html` (line ~124 and the effective date), `CLAUDE.md` (checkFlightStatus + Apple Wallet bullets)

- [ ] **Step 1: Privacy.** After the calendar paragraph in `hosting/privacy.html` add:

```html
  <p>If you add a boarding pass to Apple Wallet, Wallet gives us an identifier for your device's Wallet and a notification token, so we can update that pass when its gate, time or status changes. We keep them only while the pass is in your wallet, and delete them with the pass or your account.</p>
```
  and set the eyebrow to `Effective October 23, 2026`.

- [ ] **Step 2: CLAUDE.md.** In the `checkFlightStatus` bullet replace the polling description (`shouldPollFlight()` … `every 4h beyond`) with: "`dueCheckpoint()` — AviationStack's free plan (100 calls/month, 2026-10-23): three checks per flight (T−120 min, T−45 min, arrival + 30 min), passes from 20 h ago to 3 h ahead, status `upcoming`/`boarded`; `flightLive.ts` turns an answer into a patch (gate + `gateSource: 'live'`, terminal, `delayMinutes`, `liveDepartureLocal` — AviationStack's local clock, never parsed as UTC) and alerts (`flight_change` gate/delay ≥ 15 min and every further 15; `flight_status` landed/cancelled; airborne = `boarded`, no alert); stops on `usage_limit_reached`". Append to the Apple Wallet bullet: "**Live passes** (spec `2026-10-23-live-flight-updates-design.md`): `webServiceURL` = the `appleWalletService` function URL (direct, so Hosting can't drop `Authorization`), `authenticationToken` = `walletAuthToken(serial)`; registrations `appleWalletRegistrations/{device}__{serial}`; `onBoardingPassWrittenWallet` stamps `walletUpdatedAtMs` and pushes APNs (`apns.ts`) when `walletFieldsChanged`; change messages on gate, departs and a STATUS line (`statusLine`)".

- [ ] **Step 3: Deploy.** `npx firebase deploy --only functions:checkFlightStatus,functions:appleWalletPass,functions:appleWalletService,functions:onBoardingPassWrittenWallet,functions:deleteAccount,firestore:rules,hosting` — Expected: Deploy complete.

- [ ] **Step 4: Live checks.**
  - `curl -s -o /dev/null -w "%{http_code}\n" https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService/v1/passes/pass.com.supernovatravel.app/bp-nope` → `401`.
  - `curl -s -o /dev/null -w "%{http_code}\n" https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService/v1/devices/test/registrations/pass.com.supernovatravel.app` → `204`.
  - `curl -s -o /dev/null -w "%{http_code}\n" https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService/nothing` → `404`.
  - A local script (scratchpad, Admin SDK, owner's KL1357 pass id) computes the pass's auth token from `WALLET_LINK_SECRET` without printing it and GETs `/v1/passes/…/bp-{id}` → `200` with `application/vnd.apple.pkpass`; unzipped `pass.json` contains `webServiceURL` and the gate `changeMessage`.
  - One AviationStack call (counts against 100) via a scratchpad script: `parseLiveFlight` on a live flight number departing within 3 h → `kind: 'flight'` with a gate or null.

- [ ] **Step 5: Commit and push** `git add hosting/privacy.html CLAUDE.md && git commit -m "docs: live flight updates in CLAUDE.md and the privacy policy" && git push origin main`
