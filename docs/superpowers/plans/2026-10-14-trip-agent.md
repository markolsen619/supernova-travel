# Ask Supernova (agent phase 1: trips) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat on a trip ("Ask Supernova") that proposes changes — stops, route, dates — which the person accepts, built as the first surface of one app-wide agent.

**Architecture:** One callable Cloud Function `agent` builds a compact trip context (pure), calls Gemini once with a JSON response schema and thinking off, validates the proposed operations (pure), filters them to what the calling app declares it can apply, saves the thread and quota in one batch, and returns. The app never trusts the server to edit: it turns accepted operations into the existing trip mutations (pure planner + a hook), so Firestore rules decide exactly as for manual edits.

**Tech Stack:** Firebase Functions v2 (TypeScript, Node 22, `fetch` to the Gemini REST API — no new dependency), Firestore, Expo Router / React Native, TanStack Query, Jest (pure-function tests only, at the repo root).

**Spec:** `docs/superpowers/specs/2026-10-14-trip-agent-design.md`

## Global Constraints

- Owner's standing constraint: the best performance for the lowest cost to us.
- Model `gemini-2.5-flash`, **thinking budget 0**, one call per message; the model name is one constant in `functions/src/agentModel.ts` (the only provider-aware file).
- Free **10 messages/month**, Pro **300/month** (fair use; counter hidden until 30 remain), **one allowance shared by every surface**; charged only on success.
- One request in flight per user; **≤ 20 messages an hour**; message **≤ 500 chars**; **≤ 12 operations** per proposal.
- The server never edits the trip; operations are named per surface (`trip.*`); capability `trip.v1`; the server never returns an operation the app didn't declare.
- Booking data sent to the model: **type, name, date, time only** — never codes, addresses, barcodes.
- Threads: `users/{uid}/agentThreads/trip_{tripId}/messages/{id}`; read/delete owner only; create server only; update owner **`status` only** (`applied` | `partial` | `dismissed`).
- `AI_CONSENT_VERSION` → **2** on client and server; `AiConsentSheet` gains purpose `agent`.
- Stop times are wall-clock strings `"HH:MM"` (Architecture Rule 13); AI never presets times unless asked.
- UI: no emoji, Phosphor icons, `useTheme()` colours inline (Rule 4), haptics Light on send / Medium on Apply, 44 pt targets, `keyboardDismissMode="on-drag"` + `keyboardShouldPersistTaps="handled"`, one gradient AI action (the entry button), sentence case, no "!".
- `@/` imports in the app; functions use relative imports; pure modules in `functions/src` must not import `firebase-admin` (the root Jest suite imports them).

## Review Focus

1. A proposal applied after a collaborator changed the trip (stop deleted, day removed) → that change is skipped and reported, the rest apply. (Task 8 test `skips operations whose stop no longer exists`.)
2. The model names the same stop in two operations (move it, then remove it) → only the first survives. (Task 3 test `drops a second operation on the same stop`.)
3. A free user at 10 of 10 → refused before any Gemini call, no quota change, the app opens the paywall. (Task 1 test `refuses at the monthly limit`.)
4. The model returns broken or partial JSON → "Supernova couldn't answer right now. Try again.", no quota used. (Task 4 test `parseModelText rejects non-JSON and missing fields`.)
5. A 21-day trip with ~120 stops → the context stays inside its budget and labels for trimmed days still map back. (Task 2 test `keeps a long trip inside the budget`.)

---

### Task 1: Agent quota policy and request gate

**Files:**
- Modify: `functions/src/quotaUtils.ts` (append)
- Test: `__tests__/functions/agentQuota.test.ts`

**Interfaces:**
- Produces:
  - `AGENT_FREE_MONTHLY = 10`, `AGENT_PAID_MONTHLY = 300`, `AGENT_HOURLY_LIMIT = 20`, `AGENT_INFLIGHT_MS = 90_000`
  - `agentQuotaPolicy(tier: string | null | undefined, now?: Date): AiTripQuotaPolicy` (same shape as `aiTripQuotaPolicy`; keys `agent_YYYY-MM-01` / `agent_pro_YYYY-MM-01`)
  - `agentHourKey(now?: Date): string` → `agent_hour_2026-10-14T15`
  - `type AgentGate = 'ok' | 'monthly' | 'hourly' | 'busy'`
  - `agentGate(q: { used: number; limit: number; hourCount: number; inflightUntil: number | null; now: number }): AgentGate`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/agentQuota.test.ts
import {
  agentQuotaPolicy, agentHourKey, agentGate,
  AGENT_FREE_MONTHLY, AGENT_PAID_MONTHLY, AGENT_HOURLY_LIMIT,
} from '../../functions/src/quotaUtils';

const now = new Date('2026-10-14T15:20:00Z');

describe('agentQuotaPolicy', () => {
  it('gives free accounts a small monthly allowance that is shown', () => {
    const p = agentQuotaPolicy('free', now);
    expect(p).toMatchObject({ limit: AGENT_FREE_MONTHLY, fairUse: false, quotaKey: 'agent_2026-10-01' });
    expect(p.resetsAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('gives Pro and business a fair-use ceiling on a separate counter', () => {
    expect(agentQuotaPolicy('pro', now)).toMatchObject({ limit: AGENT_PAID_MONTHLY, fairUse: true, quotaKey: 'agent_pro_2026-10-01' });
    expect(agentQuotaPolicy('business', now).limit).toBe(AGENT_PAID_MONTHLY);
  });
  it('treats unknown or missing tiers as free', () => {
    expect(agentQuotaPolicy(undefined, now).limit).toBe(AGENT_FREE_MONTHLY);
    expect(agentQuotaPolicy('platinum', now).limit).toBe(AGENT_FREE_MONTHLY);
  });
});

describe('agentHourKey', () => {
  it('names the UTC hour', () => {
    expect(agentHourKey(now)).toBe('agent_hour_2026-10-14T15');
  });
});

describe('agentGate', () => {
  const base = { used: 0, limit: 10, hourCount: 0, inflightUntil: null, now: now.getTime() };
  it('lets a normal request through', () => {
    expect(agentGate(base)).toBe('ok');
  });
  it('refuses at the monthly limit', () => {
    expect(agentGate({ ...base, used: 10 })).toBe('monthly');
  });
  it('refuses past the hourly limit', () => {
    expect(agentGate({ ...base, hourCount: AGENT_HOURLY_LIMIT })).toBe('hourly');
  });
  it('refuses while another request is in flight, but not after it has expired', () => {
    expect(agentGate({ ...base, inflightUntil: base.now + 1000 })).toBe('busy');
    expect(agentGate({ ...base, inflightUntil: base.now - 1 })).toBe('ok');
  });
  it('reports the monthly limit before the others', () => {
    expect(agentGate({ ...base, used: 10, hourCount: 99, inflightUntil: base.now + 1000 })).toBe('monthly');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/functions/agentQuota.test.ts`
Expected: FAIL — `agentQuotaPolicy is not a function` (or TS export errors).

- [ ] **Step 3: Implement**

Append to `functions/src/quotaUtils.ts`:

```ts
// ── Agent ("Ask Supernova") policy ─────────────────────────────────────────
// docs/superpowers/specs/2026-10-14-trip-agent-design.md. One allowance shared
// by every agent surface. A message costs about a third of a cent on
// gemini-2.5-flash with thinking off, so 300/month is < $1 of worst case for a
// subscriber and the free 10 are a taste that sells Pro.

export const AGENT_FREE_MONTHLY = 10;
export const AGENT_PAID_MONTHLY = 300;
/** Anti-abuse: a script or a stuck button, never a person. */
export const AGENT_HOURLY_LIMIT = 20;
/** A request older than this no longer blocks the next one (a crashed call can't lock someone out). */
export const AGENT_INFLIGHT_MS = 90_000;

export function agentQuotaPolicy(tier: string | null | undefined, now: Date = new Date()): AiTripQuotaPolicy {
  const paid = typeof tier === 'string' && PAID_TIERS.has(tier);
  return {
    limit: paid ? AGENT_PAID_MONTHLY : AGENT_FREE_MONTHLY,
    window: 'month',
    quotaKey: getMonthlyQuotaKey(paid ? 'agent_pro' : 'agent', now),
    resetsAt: getNextMonthStart(now),
    fairUse: paid,
  };
}

export function agentHourKey(now: Date = new Date()): string {
  return `agent_hour_${now.toISOString().slice(0, 13)}`;
}

export type AgentGate = 'ok' | 'monthly' | 'hourly' | 'busy';

export function agentGate(q: { used: number; limit: number; hourCount: number; inflightUntil: number | null; now: number }): AgentGate {
  if (q.used >= q.limit) return 'monthly';
  if (q.hourCount >= AGENT_HOURLY_LIMIT) return 'hourly';
  if (q.inflightUntil != null && q.inflightUntil > q.now) return 'busy';
  return 'ok';
}
```

(`PAID_TIERS`, `getMonthlyQuotaKey`, `getNextMonthStart` and `AiTripQuotaPolicy` already exist in this file; `agentQuotaPolicy` must be placed after `PAID_TIERS` is declared.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/functions/agentQuota.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/quotaUtils.ts __tests__/functions/agentQuota.test.ts
git commit -m "feat(agent): quota policy and request gate"
```

---

### Task 2: Server types and the trip context builder

**Files:**
- Create: `functions/src/agentTypes.ts`
- Create: `functions/src/agentTripContext.ts`
- Test: `__tests__/functions/agentTripContext.test.ts`

**Interfaces:**
- Produces (`agentTypes.ts`):

```ts
export type AgentSurface = 'trip';
export const AGENT_SURFACES: readonly AgentSurface[] = ['trip'];
export const ACTIVITY_TYPES = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type AgentOp =
  | { kind: 'trip.addStop'; dayId: string; title: string; type: ActivityType; afterStopId: string | null; time: string | null }
  | { kind: 'trip.removeStop'; dayId: string; stopId: string }
  | { kind: 'trip.moveStop'; dayId: string; stopId: string; toDayId: string; afterStopId: string | null }
  | { kind: 'trip.reorderDay'; dayId: string; stopIds: string[] }
  | { kind: 'trip.updateStop'; dayId: string; stopId: string; time?: string | null; notes?: string }
  | { kind: 'trip.setNights'; city: number; nights: number }
  | { kind: 'trip.addCity'; name: string; nights: number; afterCity: number | null }
  | { kind: 'trip.removeCity'; city: number; mode: 'delete' | 'move' }
  | { kind: 'trip.moveCity'; city: number; by: -1 | 1 }
  | { kind: 'trip.shiftDates'; newStart: string };

/** Which capability an app must declare to be sent each operation. */
export const OP_CAPABILITY: Record<AgentOp['kind'], string> = {
  'trip.addStop': 'trip.v1', 'trip.removeStop': 'trip.v1', 'trip.moveStop': 'trip.v1',
  'trip.reorderDay': 'trip.v1', 'trip.updateStop': 'trip.v1', 'trip.setNights': 'trip.v1',
  'trip.addCity': 'trip.v1', 'trip.removeCity': 'trip.v1', 'trip.moveCity': 'trip.v1',
  'trip.shiftDates': 'trip.v1',
};

export type AgentStatus = 'proposed' | 'applied' | 'partial' | 'dismissed';
export interface AgentQuotaView { used: number; limit: number; fairUse: boolean; resetsAt: string }
export interface AgentResponse { messageId: string; reply: string; operations: AgentOp[]; dropped: number; quota: AgentQuotaView }
```

- Produces (`agentTripContext.ts`):

```ts
export interface CtxStop { id: string; title: string; type: string; startTime: string | null; placed: boolean; order: number }
export interface CtxDay { id: string; dayNumber: number; city: number; stops: CtxStop[] }
export interface CtxCity { name: string; nights: number | null }
export interface CtxBooking { kind: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transit' | 'car'; name: string; date: string | null; time: string | null; shared: boolean }
export interface CtxTopPlace { city: number; name: string; type: string }
export interface TripCtxInput { title: string; startDay: string | null; today: string; cities: CtxCity[]; days: CtxDay[]; bookings: CtxBooking[]; topPlaces: CtxTopPlace[] }
export interface LabelMap {
  days: Record<string, string>;                          // 'd3' -> dayId
  stops: Record<string, { dayId: string; stopId: string }>; // 's7' -> ids
  dayStops: Record<string, string[]>;                    // dayId -> its stopIds in order
  cityCount: number;
}
export const CONTEXT_BUDGET_CHARS = 12_000;               // ≈ 3k tokens
export function buildTripContext(input: TripCtxInput, budget?: number): { text: string; labels: LabelMap }
export function bookingForContext(kind: 'boarding_pass' | 'reservation', data: Record<string, unknown>, shared: boolean): CtxBooking | null
```

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/agentTripContext.test.ts
import { buildTripContext, bookingForContext, CONTEXT_BUDGET_CHARS, type TripCtxInput } from '../../functions/src/agentTripContext';

const trip = (over: Partial<TripCtxInput> = {}): TripCtxInput => ({
  title: 'Lisbon & Porto', startDay: '2026-11-02', today: '2026-10-14',
  cities: [{ name: 'Lisbon', nights: 3 }, { name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, city: 0, stops: [
      { id: 'A', title: 'Check in at Memmo Alfama', type: 'hotel', startTime: null, placed: true, order: 1 },
      { id: 'B', title: 'Lunch at Time Out Market', type: 'restaurant', startTime: '13:00', placed: false, order: 2 },
    ] },
    { id: 'D2', dayNumber: 2, city: 0, stops: [{ id: 'C', title: 'Belém Tower', type: 'activity', startTime: null, placed: true, order: 1 }] },
  ],
  bookings: [{ kind: 'flight', name: 'TAP TP202 JFK→LIS', date: '2026-11-02', time: '07:45', shared: false }],
  topPlaces: [{ city: 0, name: 'Pastéis de Belém', type: 'restaurant' }],
  ...over,
});

describe('buildTripContext', () => {
  it('labels days and stops and maps them back to ids', () => {
    const { text, labels } = buildTripContext(trip());
    expect(text).toContain('d1 2026-11-02 Lisbon');
    expect(text).toContain('s1 Check in at Memmo Alfama [hotel]');
    expect(text).toContain('s2 Lunch at Time Out Market [restaurant 13:00, unplaced]');
    expect(labels.days.d2).toBe('D2');
    expect(labels.stops.s3).toEqual({ dayId: 'D2', stopId: 'C' });
    expect(labels.dayStops.D1).toEqual(['A', 'B']);
    expect(labels.cityCount).toBe(2);
  });
  it('lists cities with nights, bookings and community favourites', () => {
    const { text } = buildTripContext(trip());
    expect(text).toContain('c1 Lisbon 3n | c2 Porto 2n');
    expect(text).toContain('flight TAP TP202 JFK→LIS 2026-11-02 07:45');
    expect(text).toContain('c1: Pastéis de Belém (restaurant)');
  });
  it('works without dates', () => {
    const { text } = buildTripContext(trip({ startDay: null }));
    expect(text).toContain('d1 Lisbon');
    expect(text).toContain('dates not set');
  });
  it('keeps a long trip inside the budget', () => {
    const days = Array.from({ length: 21 }, (_, i) => ({
      id: `D${i + 1}`, dayNumber: i + 1, city: 0,
      stops: Array.from({ length: 6 }, (_, j) => ({ id: `S${i}_${j}`, title: `A rather long stop title number ${j} on day ${i + 1} somewhere nice`, type: 'activity', startTime: null, placed: true, order: j })),
    }));
    const { text, labels } = buildTripContext(trip({ days }));
    expect(text.length).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS);
    expect(labels.stops.s126).toEqual({ dayId: 'D21', stopId: 'S20_5' });
    expect(text).toContain('d21');
  });
});

describe('bookingForContext', () => {
  it('keeps type, name, date and time — never codes, addresses or barcodes', () => {
    const b = bookingForContext('reservation', {
      type: 'hotel', title: 'Memmo Alfama', checkIn: '2026-11-02', confirmationCode: 'XYZ123', address: 'Travessa 1', time: null,
    }, false);
    expect(b).toEqual({ kind: 'hotel', name: 'Memmo Alfama', date: '2026-11-02', time: null, shared: false });
    expect(JSON.stringify(b)).not.toContain('XYZ123');
    const f = bookingForContext('boarding_pass', {
      airline: 'TAP', flightNumber: 'TP202', origin: 'JFK', destination: 'LIS', departureTime: '2026-11-02T07:45:00', localDate: '2026-11-02', barcode: 'M1SECRET',
    }, true);
    expect(f).toEqual({ kind: 'flight', name: 'TAP TP202 JFK→LIS', date: '2026-11-02', time: '07:45', shared: true });
    expect(JSON.stringify(f)).not.toContain('SECRET');
  });
  it('reads train tickets stored as activities with a transit mode, and rental cars', () => {
    expect(bookingForContext('reservation', { type: 'activity', transitMode: 'train', title: 'Lisbon → Porto', checkIn: '2026-11-05', time: '09:19' }, false)?.kind).toBe('transit');
    expect(bookingForContext('reservation', { type: 'rental_car', title: 'Hertz', checkIn: '2026-11-05' }, false)?.kind).toBe('car');
  });
  it('ignores bookings without a name', () => {
    expect(bookingForContext('reservation', { type: 'hotel' }, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/functions/agentTripContext.test.ts`
Expected: FAIL — cannot find module `agentTripContext`.

- [ ] **Step 3: Implement**

Create `functions/src/agentTypes.ts` with exactly the code in the Interfaces block above (plus a header comment pointing at the spec).

Create `functions/src/agentTripContext.ts`:

```ts
/**
 * The trip as the agent sees it (docs/superpowers/specs/2026-10-14-trip-agent-design.md):
 * compact text with short labels (d1, s4, c2) in place of Firestore ids — fewer
 * tokens, and the model can't invent an id. Pure: no firebase-admin.
 */
export interface CtxStop { id: string; title: string; type: string; startTime: string | null; placed: boolean; order: number }
export interface CtxDay { id: string; dayNumber: number; city: number; stops: CtxStop[] }
export interface CtxCity { name: string; nights: number | null }
export interface CtxBooking { kind: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transit' | 'car'; name: string; date: string | null; time: string | null; shared: boolean }
export interface CtxTopPlace { city: number; name: string; type: string }
export interface TripCtxInput { title: string; startDay: string | null; today: string; cities: CtxCity[]; days: CtxDay[]; bookings: CtxBooking[]; topPlaces: CtxTopPlace[] }
export interface LabelMap {
  days: Record<string, string>;
  stops: Record<string, { dayId: string; stopId: string }>;
  dayStops: Record<string, string[]>;
  cityCount: number;
}

export const CONTEXT_BUDGET_CHARS = 12_000;
const TITLE_MAX = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildTripContext(input: TripCtxInput, budget: number = CONTEXT_BUDGET_CHARS): { text: string; labels: LabelMap } {
  const labels: LabelMap = { days: {}, stops: {}, dayStops: {}, cityCount: input.cities.length };
  const days = [...input.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const start = input.startDay && DAY_RE.test(input.startDay) ? input.startDay : null;

  // Labels for everything first, so trimmed lines still map back.
  let n = 0;
  const dayLines: { full: string; short: string }[] = [];
  for (const d of days) {
    const dl = `d${d.dayNumber}`;
    labels.days[dl] = d.id;
    const stops = [...d.stops].sort((a, b) => a.order - b.order);
    labels.dayStops[d.id] = stops.map((s) => s.id);
    const city = input.cities[d.city]?.name ?? input.cities[0]?.name ?? '';
    const head = start ? `${dl} ${addDays(start, d.dayNumber - 1)} ${city}` : `${dl} ${city}`;
    const parts = stops.map((s) => {
      n += 1;
      labels.stops[`s${n}`] = { dayId: d.id, stopId: s.id };
      return `s${n} ${clip(s.title, TITLE_MAX)} [${fixMeta(s.type, s.startTime, s.placed)}]`;
    });
    const first = n - stops.length + 1;
    dayLines.push({
      full: `${head}: ${parts.length ? parts.join(' · ') : '(no stops)'}`,
      short: `${head}: ${stops.length} stops (s${first}–s${n})`,
    });
  }

  const header = [
    `TODAY ${input.today}`,
    `TRIP "${clip(input.title, 80)}" ${start ? `starts ${start}` : 'dates not set'}`,
    `CITIES: ${input.cities.map((c, i) => `c${i + 1} ${c.name}${c.nights != null ? ` ${c.nights}n` : ''}`).join(' | ')}`,
  ].join('\n');
  const bookings = input.bookings.length
    ? `BOOKINGS: ${input.bookings.map((b) => [b.kind, b.name, b.date, b.time].filter(Boolean).join(' ') + (b.shared ? ' (shared)' : '')).join(' | ')}`
    : 'BOOKINGS: none';
  const favourites = input.topPlaces.length
    ? `COMMUNITY FAVOURITES: ${groupTop(input.topPlaces)}`
    : '';

  // Trim: far days (from the end) drop to one-line summaries until it fits.
  const lines = dayLines.map((d) => d.full);
  const assemble = () => [header, ...lines, bookings, favourites].filter(Boolean).join('\n');
  for (let i = lines.length - 1; i >= 0 && assemble().length > budget; i--) lines[i] = dayLines[i].short;
  let text = assemble();
  if (text.length > budget) text = text.slice(0, budget);
  return { text, labels };
}

function fixMeta(type: string, time: string | null, placed: boolean): string {
  const head = time ? `${type} ${time}` : type;
  return placed ? head : `${head}, unplaced`;
}

function groupTop(places: CtxTopPlace[]): string {
  const by = new Map<number, string[]>();
  for (const p of places) by.set(p.city, [...(by.get(p.city) ?? []), `${p.name} (${p.type})`]);
  return [...by.entries()].map(([c, list]) => `c${c + 1}: ${list.join(', ')}`).join(' | ');
}

/** A wallet booking reduced to what the model may see: type, name, date, time. Never codes, addresses, barcodes. */
export function bookingForContext(kind: 'boarding_pass' | 'reservation', d: Record<string, unknown>, shared: boolean): CtxBooking | null {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (kind === 'boarding_pass') {
    const name = [str(d.airline), str(d.flightNumber)].filter(Boolean).join(' ');
    if (!name) return null;
    const route = str(d.origin) && str(d.destination) ? ` ${str(d.origin)}→${str(d.destination)}` : '';
    const dep = str(d.departureTime);
    return { kind: 'flight', name: `${name}${route}`, date: str(d.localDate) ?? (dep ? dep.slice(0, 10) : null), time: dep && dep.length >= 16 ? dep.slice(11, 16) : null, shared };
  }
  const title = str(d.title);
  if (!title) return null;
  const type = str(d.type);
  const k: CtxBooking['kind'] =
    type === 'hotel' || type === 'airbnb' ? 'hotel'
      : type === 'rental_car' ? 'car'
        : type === 'restaurant' ? 'restaurant'
          : str(d.transitMode) ? 'transit' : 'activity';
  const checkIn = str(d.checkIn);
  return { kind: k, name: clip(title, TITLE_MAX), date: checkIn ? checkIn.slice(0, 10) : null, time: str(d.time), shared };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/functions/agentTripContext.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/agentTypes.ts functions/src/agentTripContext.ts __tests__/functions/agentTripContext.test.ts
git commit -m "feat(agent): operation types and the compact trip context"
```

---

### Task 3: Validating proposals, capabilities and the surface registry

**Files:**
- Create: `functions/src/agentTripOps.ts`
- Create: `functions/src/agentSurfaces.ts`
- Test: `__tests__/functions/agentTripOps.test.ts`

**Interfaces:**
- Consumes: `AgentOp`, `ACTIVITY_TYPES`, `OP_CAPABILITY`, `AGENT_SURFACES` (Task 2); `LabelMap` (Task 2).
- Produces:
  - `MAX_OPERATIONS = 12`
  - `validateTripOps(raw: unknown, labels: LabelMap): { ops: AgentOp[]; dropped: number }`
  - `filterByCapabilities(ops: AgentOp[], capabilities: unknown): AgentOp[]`
  - `isAgentSurface(v: unknown): v is AgentSurface`
  - `threadId(surface: AgentSurface, subjectId: string): string` → `trip_<id>`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/agentTripOps.test.ts
import { validateTripOps, MAX_OPERATIONS } from '../../functions/src/agentTripOps';
import { filterByCapabilities, isAgentSurface, threadId } from '../../functions/src/agentSurfaces';
import type { LabelMap } from '../../functions/src/agentTripContext';

const labels: LabelMap = {
  days: { d1: 'D1', d2: 'D2' },
  stops: { s1: { dayId: 'D1', stopId: 'A' }, s2: { dayId: 'D1', stopId: 'B' }, s3: { dayId: 'D2', stopId: 'C' } },
  dayStops: { D1: ['A', 'B'], D2: ['C'] },
  cityCount: 2,
};

describe('validateTripOps', () => {
  it('maps labels to ids for every operation kind', () => {
    const { ops, dropped } = validateTripOps([
      { op: 'addStop', day: 'd2', title: 'Dinner at Ramiro', type: 'restaurant', after: 's3', time: '20:00' },
      { op: 'removeStop', stop: 's2' },
      { op: 'moveStop', stop: 's1', toDay: 'd2', after: null },
      { op: 'updateStop', stop: 's3', time: null, note: 'Go early' },
      { op: 'setNights', city: 'c2', nights: 3 },
      { op: 'addCity', name: 'Sintra', nights: 1, after: 'c1' },
      { op: 'moveCity', city: 'c2', by: -1 },
      { op: 'shiftDates', newStart: '2026-11-04' },
    ], labels);
    expect(dropped).toBe(0);
    expect(ops).toEqual([
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: 'C', time: '20:00' },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null },
      { kind: 'trip.updateStop', dayId: 'D2', stopId: 'C', time: null, notes: 'Go early' },
      { kind: 'trip.setNights', city: 1, nights: 3 },
      { kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 },
      { kind: 'trip.moveCity', city: 1, by: -1 },
      { kind: 'trip.shiftDates', newStart: '2026-11-04' },
    ]);
  });
  it('accepts a reorder only when it lists exactly that day\'s stops', () => {
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2', 's1'] }], labels).ops)
      .toEqual([{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A'] }]);
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2'] }], labels).dropped).toBe(1);
    expect(validateTripOps([{ op: 'reorderDay', day: 'd1', stops: ['s2', 's3'] }], labels).dropped).toBe(1);
  });
  it('drops unknown labels, bad times, bad dates and unknown kinds', () => {
    const r = validateTripOps([
      { op: 'removeStop', stop: 's9' },
      { op: 'addStop', day: 'd7', title: 'X marks', type: 'activity' },
      { op: 'updateStop', stop: 's1', time: '25:00' },
      { op: 'shiftDates', newStart: '2026-13-40' },
      { op: 'bookFlight' },
      { op: 'setNights', city: 'c5', nights: 2 },
      { op: 'setNights', city: 'c1', nights: 0 },
    ], labels);
    expect(r.ops).toEqual([]);
    expect(r.dropped).toBe(7);
  });
  it('drops a second operation on the same stop', () => {
    const r = validateTripOps([{ op: 'moveStop', stop: 's1', toDay: 'd2' }, { op: 'removeStop', stop: 's1' }], labels);
    expect(r.ops.map((o) => o.kind)).toEqual(['trip.moveStop']);
    expect(r.dropped).toBe(1);
  });
  it('never removes the only city, and keeps the after-stop on the target day', () => {
    const one: LabelMap = { ...labels, cityCount: 1 };
    expect(validateTripOps([{ op: 'removeCity', city: 'c1', mode: 'delete' }], one).dropped).toBe(1);
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: 'Coffee', type: 'restaurant', after: 's3' }], labels).ops[0])
      .toMatchObject({ afterStopId: null });
  });
  it('cleans titles and types', () => {
    const r = validateTripOps([{ op: 'addStop', day: 'd1', title: '  Miradouro da Senhora do Monte  ', type: 'viewpoint' }], labels);
    expect(r.ops[0]).toMatchObject({ title: 'Miradouro da Senhora do Monte', type: 'activity', time: null });
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: '', type: 'activity' }], labels).dropped).toBe(1);
    expect(validateTripOps([{ op: 'addStop', day: 'd1', title: 'x'.repeat(81), type: 'activity' }], labels).dropped).toBe(1);
  });
  it(`keeps at most ${MAX_OPERATIONS} operations`, () => {
    const many = Array.from({ length: 15 }, () => ({ op: 'addStop', day: 'd1', title: 'Gelato stop', type: 'restaurant' }));
    const r = validateTripOps(many, labels);
    expect(r.ops).toHaveLength(MAX_OPERATIONS);
    expect(r.dropped).toBe(3);
  });
  it('survives garbage', () => {
    expect(validateTripOps(null, labels)).toEqual({ ops: [], dropped: 0 });
    expect(validateTripOps('nope', labels)).toEqual({ ops: [], dropped: 0 });
    expect(validateTripOps([42, null], labels)).toEqual({ ops: [], dropped: 2 });
  });
});

describe('filterByCapabilities', () => {
  const ops = validateTripOps([{ op: 'removeStop', stop: 's1' }], labels).ops;
  it('returns operations the app declared it can apply', () => {
    expect(filterByCapabilities(ops, ['trip.v1'])).toEqual(ops);
  });
  it('returns nothing to an app that declared nothing (an older or different build)', () => {
    expect(filterByCapabilities(ops, [])).toEqual([]);
    expect(filterByCapabilities(ops, undefined)).toEqual([]);
    expect(filterByCapabilities(ops, ['wallet.v1'])).toEqual([]);
  });
});

describe('surfaces', () => {
  it('knows only the trip surface in phase 1', () => {
    expect(isAgentSurface('trip')).toBe(true);
    expect(isAgentSurface('wallet')).toBe(false);
    expect(isAgentSurface(undefined)).toBe(false);
  });
  it('names a thread by surface and subject', () => {
    expect(threadId('trip', 'abc123')).toBe('trip_abc123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/functions/agentTripOps.test.ts`
Expected: FAIL — cannot find module `agentTripOps`.

- [ ] **Step 3: Implement**

`functions/src/agentSurfaces.ts`:

```ts
/**
 * The agent's surfaces (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "Built to grow").
 * Phase 1 has one: 'trip'. A new surface adds its context builder and validator and an entry here.
 * Pure: no firebase-admin.
 */
import { AGENT_SURFACES, OP_CAPABILITY, type AgentOp, type AgentSurface } from './agentTypes';

export function isAgentSurface(v: unknown): v is AgentSurface {
  return typeof v === 'string' && (AGENT_SURFACES as readonly string[]).includes(v);
}

export function threadId(surface: AgentSurface, subjectId: string): string {
  return `${surface}_${subjectId}`;
}

/** Only operations the calling app declared it can apply — shipped apps survive every later expansion. */
export function filterByCapabilities(ops: AgentOp[], capabilities: unknown): AgentOp[] {
  if (!Array.isArray(capabilities)) return [];
  const caps = new Set(capabilities.filter((c): c is string => typeof c === 'string'));
  return ops.filter((o) => caps.has(OP_CAPABILITY[o.kind]));
}
```

`functions/src/agentTripOps.ts`:

```ts
/**
 * Turns the model's proposed operations (labels: d1, s4, c2) into checked
 * operations on real ids, dropping anything that doesn't fit the trip.
 * Pure: no firebase-admin. Spec: docs/superpowers/specs/2026-10-14-trip-agent-design.md.
 */
import { ACTIVITY_TYPES, type ActivityType, type AgentOp } from './agentTypes';
import type { LabelMap } from './agentTripContext';

export const MAX_OPERATIONS = 12;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function cityIndex(v: unknown, count: number): number | null {
  const m = /^c(\d+)$/.exec(str(v));
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < count ? i : null;
}
function time(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined || v === '') return undefined;
  const t = str(v);
  return TIME_RE.test(t) ? t : undefined;
}

export function validateTripOps(raw: unknown, labels: LabelMap): { ops: AgentOp[]; dropped: number } {
  if (!Array.isArray(raw)) return { ops: [], dropped: 0 };
  const ops: AgentOp[] = [];
  const touched = new Set<string>();
  let dropped = 0;

  const stopRef = (v: unknown) => labels.stops[str(v)] ?? null;
  const take = (stopId: string) => {
    if (touched.has(stopId)) return false;
    touched.add(stopId);
    return true;
  };

  for (const item of raw) {
    if (ops.length >= MAX_OPERATIONS) { dropped += 1; continue; }
    const op = parse(item && typeof item === 'object' ? (item as Raw) : null);
    if (op) ops.push(op); else dropped += 1;
  }
  return { ops, dropped };

  function parse(r: Raw | null): AgentOp | null {
    if (!r) return null;
    switch (str(r.op)) {
      case 'addStop': {
        const dayId = labels.days[str(r.day)];
        const title = str(r.title);
        if (!dayId || title.length < 2 || title.length > 80) return null;
        const t = time(r.time);
        if (r.time !== undefined && r.time !== null && r.time !== '' && t === undefined) return null;
        const after = stopRef(r.after);
        const type = (ACTIVITY_TYPES as readonly string[]).includes(str(r.type)) ? (str(r.type) as ActivityType) : 'activity';
        return { kind: 'trip.addStop', dayId, title, type, afterStopId: after && after.dayId === dayId ? after.stopId : null, time: t ?? null };
      }
      case 'removeStop': {
        const s = stopRef(r.stop);
        if (!s || !take(s.stopId)) return null;
        return { kind: 'trip.removeStop', dayId: s.dayId, stopId: s.stopId };
      }
      case 'moveStop': {
        const s = stopRef(r.stop);
        const toDayId = labels.days[str(r.toDay)];
        if (!s || !toDayId || !take(s.stopId)) return null;
        const after = stopRef(r.after);
        return { kind: 'trip.moveStop', dayId: s.dayId, stopId: s.stopId, toDayId, afterStopId: after && after.dayId === toDayId ? after.stopId : null };
      }
      case 'reorderDay': {
        const dayId = labels.days[str(r.day)];
        if (!dayId || !Array.isArray(r.stops)) return null;
        const ids = r.stops.map((x) => stopRef(x)).map((s) => (s && s.dayId === dayId ? s.stopId : null));
        const current = labels.dayStops[dayId] ?? [];
        if (ids.some((x) => !x) || ids.length !== current.length || new Set(ids).size !== current.length) return null;
        if (current.some((id) => touched.has(id))) return null;
        current.forEach((id) => touched.add(id));
        return { kind: 'trip.reorderDay', dayId, stopIds: ids as string[] };
      }
      case 'updateStop': {
        const s = stopRef(r.stop);
        if (!s) return null;
        const t = time(r.time);
        const badTime = r.time !== undefined && r.time !== null && r.time !== '' && t === undefined;
        const notes = typeof r.note === 'string' ? r.note.trim().slice(0, 300) : undefined;
        if (badTime || (t === undefined && notes === undefined) || !take(s.stopId)) return null;
        return { kind: 'trip.updateStop', dayId: s.dayId, stopId: s.stopId, ...(t !== undefined ? { time: t } : {}), ...(notes !== undefined ? { notes } : {}) };
      }
      case 'setNights': {
        const city = cityIndex(r.city, labels.cityCount);
        const nights = int(r.nights);
        if (city == null || nights == null || nights < 1 || nights > 30) return null;
        return { kind: 'trip.setNights', city, nights };
      }
      case 'addCity': {
        const name = str(r.name);
        const nights = int(r.nights);
        if (name.length < 2 || name.length > 60 || nights == null || nights < 1 || nights > 30) return null;
        return { kind: 'trip.addCity', name, nights, afterCity: cityIndex(r.after, labels.cityCount) };
      }
      case 'removeCity': {
        const city = cityIndex(r.city, labels.cityCount);
        const mode = str(r.mode) === 'move' ? 'move' : 'delete';
        if (city == null || labels.cityCount < 2) return null;
        return { kind: 'trip.removeCity', city, mode };
      }
      case 'moveCity': {
        const city = cityIndex(r.city, labels.cityCount);
        const by = int(r.by);
        if (city == null || (by !== 1 && by !== -1)) return null;
        if (city + by < 0 || city + by >= labels.cityCount) return null;
        return { kind: 'trip.moveCity', city, by };
      }
      case 'shiftDates': {
        const newStart = str(r.newStart);
        return validDate(newStart) ? { kind: 'trip.shiftDates', newStart } : null;
      }
      default:
        return null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/functions/agentTripOps.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/agentTripOps.ts functions/src/agentSurfaces.ts __tests__/functions/agentTripOps.test.ts
git commit -m "feat(agent): validate proposals, filter by app capabilities, surface registry"
```

---

### Task 4: Prompt, response schema and the model wrapper

**Files:**
- Create: `functions/src/agentPrompt.ts`
- Create: `functions/src/agentModel.ts`
- Test: `__tests__/functions/agentModel.test.ts`

**Interfaces:**
- Produces (`agentPrompt.ts`): `TRIP_SYSTEM_PROMPT: string`, `AGENT_RESPONSE_SCHEMA: object`
- Produces (`agentModel.ts`):
  - `AGENT_MODEL = 'gemini-2.5-flash'`, `AGENT_THINKING_BUDGET = 0`
  - `interface ModelTurn { role: 'user' | 'model'; text: string }`
  - `interface ModelResult { json: { reply: string; operations: unknown[] }; inputTokens: number; outputTokens: number; latencyMs: number }`
  - `geminiRequestBody(a: { system: string; turns: ModelTurn[]; schema: object; thinkingBudget: number }): object` (pure)
  - `parseModelText(text: unknown): { reply: string; operations: unknown[] } | null` (pure)
  - `generate(a: { system: string; turns: ModelTurn[]; schema: object; apiKey: string; model?: string; thinkingBudget?: number; timeoutMs?: number }): Promise<ModelResult>` (throws on any failure)

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/functions/agentModel.test.ts
import { geminiRequestBody, parseModelText, AGENT_MODEL, AGENT_THINKING_BUDGET } from '../../functions/src/agentModel';
import { AGENT_RESPONSE_SCHEMA, TRIP_SYSTEM_PROMPT } from '../../functions/src/agentPrompt';

describe('geminiRequestBody', () => {
  it('asks for JSON in our schema, thinking off, with the system prompt and turns', () => {
    const body = geminiRequestBody({
      system: 'SYS', schema: AGENT_RESPONSE_SCHEMA, thinkingBudget: AGENT_THINKING_BUDGET,
      turns: [{ role: 'user', text: 'hi' }, { role: 'model', text: '{"reply":"hey","operations":[]}' }, { role: 'user', text: 'again' }],
    }) as any;
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] });
    expect(body.contents).toHaveLength(3);
    expect(body.contents[2]).toEqual({ role: 'user', parts: [{ text: 'again' }] });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: AGENT_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
  it('uses the cheap, fast defaults', () => {
    expect(AGENT_MODEL).toBe('gemini-2.5-flash');
    expect(AGENT_THINKING_BUDGET).toBe(0);
  });
});

describe('parseModelText', () => {
  it('reads a reply and operations', () => {
    expect(parseModelText('{"reply":"Done","operations":[{"op":"removeStop","stop":"s1"}]}'))
      .toEqual({ reply: 'Done', operations: [{ op: 'removeStop', stop: 's1' }] });
  });
  it('treats missing operations as none', () => {
    expect(parseModelText('{"reply":"Day 2 looks fine."}')).toEqual({ reply: 'Day 2 looks fine.', operations: [] });
  });
  it('parseModelText rejects non-JSON and missing fields', () => {
    expect(parseModelText('Sure! Here is')).toBeNull();
    expect(parseModelText('{"operations":[]}')).toBeNull();
    expect(parseModelText('{"reply":""}')).toBeNull();
    expect(parseModelText(undefined)).toBeNull();
  });
});

describe('TRIP_SYSTEM_PROMPT', () => {
  it('states the rules the validator relies on', () => {
    expect(TRIP_SYSTEM_PROMPT).toMatch(/only labels that appear/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/never set a time unless/i);
    expect(TRIP_SYSTEM_PROMPT).toMatch(/at most 12/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/functions/agentModel.test.ts`
Expected: FAIL — cannot find module `agentModel`.

- [ ] **Step 3: Implement**

`functions/src/agentPrompt.ts`:

```ts
/** What the agent is told, and the JSON shape it must answer in. Pure. */
import { ACTIVITY_TYPES } from './agentTypes';

export const TRIP_SYSTEM_PROMPT = `You are Supernova, a travel planner inside the Supernova app. You help one person change the trip shown below.

You never change anything yourself. You answer in JSON: "reply" (at most 3 short sentences, plain text, the person's language, no emoji, no exclamation marks) and "operations" (proposed changes the person can accept). For a question, answer in "reply" with no operations.

Refer to days, stops and cities with only labels that appear in the trip (d1, s4, c2). Never invent a label. To add a new place, give its real, specific name as the title (for example "Dinner at Cervejaria Ramiro", "Miradouro da Senhora do Monte") and the right type; prefer the COMMUNITY FAVOURITES when they fit the request. Never set a time unless the person asks for one. Keep the order of a day sensible: sights in the day, dinner in the evening. Respect the bookings: never propose something that clashes with a booked flight, train or hotel.

Operations (at most 12):
- addStop: day, title, type, after (a stop on that day, or null for the end), time (only if asked)
- removeStop: stop
- moveStop: stop, toDay, after (a stop on toDay, or null)
- reorderDay: day, stops (every stop of that day, in the new order)
- updateStop: stop, time ("HH:MM" or null to clear) and/or note
- setNights: city, nights
- addCity: name, nights, after (a city, or null for the end)
- removeCity: city, mode ("delete" its days, or "move" them to the neighbour)
- moveCity: city, by (-1 earlier, 1 later)
- shiftDates: newStart ("YYYY-MM-DD")

If the request has nothing to do with this trip, say briefly what you can help with.`;

export const AGENT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    operations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['addStop', 'removeStop', 'moveStop', 'reorderDay', 'updateStop', 'setNights', 'addCity', 'removeCity', 'moveCity', 'shiftDates'] },
          day: { type: 'STRING' },
          stop: { type: 'STRING' },
          toDay: { type: 'STRING' },
          after: { type: 'STRING', nullable: true },
          stops: { type: 'ARRAY', items: { type: 'STRING' } },
          title: { type: 'STRING' },
          type: { type: 'STRING', enum: [...ACTIVITY_TYPES] },
          time: { type: 'STRING', nullable: true },
          note: { type: 'STRING' },
          city: { type: 'STRING' },
          nights: { type: 'INTEGER' },
          name: { type: 'STRING' },
          mode: { type: 'STRING', enum: ['delete', 'move'] },
          by: { type: 'INTEGER' },
          newStart: { type: 'STRING' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'operations'],
} as const;
```

`functions/src/agentModel.ts`:

```ts
/**
 * The only provider-aware file in the agent (spec "Built to grow"): one call to
 * Gemini's REST API with a JSON schema and thinking off — thinking tokens bill
 * as output and add latency, and trip edits don't need them. Switch the model
 * here, by evidence from scripts/agent-eval.mjs. No firebase-admin.
 */
export const AGENT_MODEL = 'gemini-2.5-flash';
export const AGENT_THINKING_BUDGET = 0;

export interface ModelTurn { role: 'user' | 'model'; text: string }
export interface ModelResult { json: { reply: string; operations: unknown[] }; inputTokens: number; outputTokens: number; latencyMs: number }

export function geminiRequestBody(a: { system: string; turns: ModelTurn[]; schema: object; thinkingBudget: number }): object {
  return {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: a.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: a.schema,
      temperature: 0.3,
      maxOutputTokens: 1500,
      thinkingConfig: { thinkingBudget: a.thinkingBudget },
    },
  };
}

export function parseModelText(text: unknown): { reply: string; operations: unknown[] } | null {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text) as { reply?: unknown; operations?: unknown };
    if (typeof v.reply !== 'string' || !v.reply.trim()) return null;
    return { reply: v.reply.trim(), operations: Array.isArray(v.operations) ? v.operations : [] };
  } catch {
    return null;
  }
}

export async function generate(a: {
  system: string; turns: ModelTurn[]; schema: object; apiKey: string;
  model?: string; thinkingBudget?: number; timeoutMs?: number;
}): Promise<ModelResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), a.timeoutMs ?? 30_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${a.model ?? AGENT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': a.apiKey },
        body: JSON.stringify(geminiRequestBody({ system: a.system, turns: a.turns, schema: a.schema, thinkingBudget: a.thinkingBudget ?? AGENT_THINKING_BUDGET })),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const json = parseModelText(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''));
    if (!json) throw new Error('gemini: unreadable response');
    return {
      json,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/functions/agentModel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/agentPrompt.ts functions/src/agentModel.ts __tests__/functions/agentModel.test.ts
git commit -m "feat(agent): system prompt, response schema, Gemini wrapper with thinking off"
```

---

### Task 5: The `agent` and `getAgentQuota` callables, trip clean-up, rules, index

**Files:**
- Create: `functions/src/agentFunctions.ts`
- Modify: `functions/src/index.ts` (export)
- Modify: `firestore.rules` (inside `match /users/{uid}`, next to `match /hidden/{contentKey}`)
- Modify: `firestore.indexes.json` (`fieldOverrides`)

**Interfaces:**
- Consumes: Tasks 1–4; `loadCatalog` (`./discoveryFunctions`), `destinationKeysFor` (`./discovery`), `hasAiConsent`, `AI_CONSENT_REQUIRED_MESSAGE` (`./aiConsent`), `isValidRequestId` (`./generationRequest`).
- Produces: callables `agent` (request `{ surface, subjectId, message, requestId, capabilities }` → `AgentResponse`), `getAgentQuota` (→ `AgentQuotaView`); trigger `onTripDeletedAgentThreads`. Message docs: `{ agentThread, surface, subjectId, role, text, operations?, dropped?, status?, createdAt }`, ids `${requestId}_u` (user) and `${requestId}` (reply).

This task's logic is in Tasks 1–4's tested pure functions; this file is wiring. Its check is the TypeScript build plus Task 11's evaluation against the deployed function.

- [ ] **Step 1: Write the function file**

```ts
// functions/src/agentFunctions.ts
/**
 * "Ask Supernova" (docs/superpowers/specs/2026-10-14-trip-agent-design.md).
 * One Gemini call per message; proposes operations, never edits the trip.
 * Pure rules: agentTripContext, agentTripOps, agentSurfaces, agentModel, quotaUtils.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { isValidRequestId } from './generationRequest';
import { agentGate, agentHourKey, agentQuotaPolicy, AGENT_INFLIGHT_MS } from './quotaUtils';
import { buildTripContext, bookingForContext, type CtxBooking, type CtxDay, type CtxTopPlace } from './agentTripContext';
import { validateTripOps } from './agentTripOps';
import { filterByCapabilities, isAgentSurface, threadId } from './agentSurfaces';
import { generate, type ModelTurn } from './agentModel';
import { AGENT_RESPONSE_SCHEMA, TRIP_SYSTEM_PROMPT } from './agentPrompt';
import { loadCatalog } from './discoveryFunctions';
import { destinationKeysFor } from './discovery';
import type { AgentOp, AgentQuotaView, AgentResponse } from './agentTypes';

const db = () => admin.firestore();
const MESSAGE_MAX = 500;
const HISTORY = 10;
const FAIL = "Supernova couldn't answer right now. Try again.";

const ms = (v: unknown) => (v && typeof (v as admin.firestore.Timestamp).toMillis === 'function' ? (v as admin.firestore.Timestamp).toMillis() : null);

function quotaView(tier: string, q: admin.firestore.DocumentData | undefined, extra = 0): AgentQuotaView {
  const p = agentQuotaPolicy(tier);
  return { used: ((q?.[p.quotaKey] as number) ?? 0) + extra, limit: p.limit, fairUse: p.fairUse, resetsAt: p.resetsAt.toISOString() };
}

export const getAgentQuota = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const [user, quota] = await Promise.all([db().doc(`users/${req.auth.uid}`).get(), db().doc(`usage_quotas/${req.auth.uid}`).get()]);
  return quotaView(String(user.get('tier') ?? 'free'), quota.data());
});

export const agent = onCall({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' }, async (req): Promise<AgentResponse> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const { surface, subjectId, message, requestId, capabilities } = (req.data ?? {}) as Record<string, unknown>;
  if (!isAgentSurface(surface)) throw new HttpsError('invalid-argument', 'Unknown surface');
  if (typeof subjectId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(subjectId)) throw new HttpsError('invalid-argument', 'Bad trip');
  if (typeof message !== 'string' || !message.trim() || message.length > MESSAGE_MAX) throw new HttpsError('invalid-argument', `Messages can be up to ${MESSAGE_MAX} characters.`);
  if (!isValidRequestId(requestId)) throw new HttpsError('invalid-argument', 'Bad request');

  const thread = db().collection(`users/${uid}/agentThreads/${threadId(surface, subjectId)}/messages`);
  const replyRef = thread.doc(requestId);
  const userRef = db().doc(`users/${uid}`);
  const quotaRef = db().doc(`usage_quotas/${uid}`);
  const [userSnap, existing] = await Promise.all([userRef.get(), replyRef.get()]);
  const tier = String(userSnap.get('tier') ?? 'free');

  // Retry after a dropped connection: the saved answer, no quota, no model call.
  if (existing.exists) {
    const q = (await quotaRef.get()).data();
    return { messageId: existing.id, reply: existing.get('text'), operations: filterByCapabilities(existing.get('operations') ?? [], capabilities), dropped: existing.get('dropped') ?? 0, quota: quotaView(tier, q) };
  }

  if (!hasAiConsent(userSnap.data())) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);

  const tripRef = db().doc(`trips/${subjectId}`);
  const tripSnap = await tripRef.get();
  const trip = tripSnap.data();
  const members = trip ? [trip.authorUid, ...(Array.isArray(trip.collaborators) ? trip.collaborators : [])] : [];
  if (!trip || !members.includes(uid) || trip.moderationHidden === true) throw new HttpsError('permission-denied', 'You can only plan trips you\'re on.');

  // Monthly + hourly + one-at-a-time, claimed in one transaction.
  const policy = agentQuotaPolicy(tier);
  const hourKey = agentHourKey();
  await db().runTransaction(async (tx) => {
    const q = (await tx.get(quotaRef)).data() ?? {};
    const gate = agentGate({ used: q[policy.quotaKey] ?? 0, limit: policy.limit, hourCount: q[hourKey] ?? 0, inflightUntil: q.agentInflightUntil ?? null, now: Date.now() });
    // `details.reason` tells the app which limit: only the monthly one on a free account opens the paywall.
    if (gate === 'monthly') throw new HttpsError('resource-exhausted', policy.fairUse ? 'That\'s a lot of planning this month. It resets on the 1st.' : 'Free accounts get 10 messages a month. Pro gives you plenty more.', { reason: 'monthly', fairUse: policy.fairUse });
    if (gate === 'hourly') throw new HttpsError('resource-exhausted', 'Give it a few minutes and try again.', { reason: 'hourly' });
    if (gate === 'busy') throw new HttpsError('aborted', 'Supernova is still answering your last message.');
    tx.set(quotaRef, { [hourKey]: admin.firestore.FieldValue.increment(1), agentInflightUntil: Date.now() + AGENT_INFLIGHT_MS }, { merge: true });
  });

  try {
    const [daysSnap, history, bookings, topPlaces] = await Promise.all([
      tripRef.collection('days').get(),
      thread.orderBy('createdAt', 'desc').limit(HISTORY).get(),
      loadBookings(uid, subjectId),
      loadTopPlaces(trip),
    ]);
    const days: CtxDay[] = await Promise.all(daysSnap.docs.map(async (d) => {
      const acts = await d.ref.collection('activities').get();
      return {
        id: d.id, dayNumber: Number(d.get('dayNumber') ?? 0), city: Number(d.get('destinationIndex') ?? 0),
        stops: acts.docs.map((a) => ({
          id: a.id, title: String(a.get('title') ?? ''), type: String(a.get('type') ?? 'activity'),
          startTime: (a.get('startTime') as string | null) ?? null, placed: a.get('lat') != null, order: Number(a.get('order') ?? 0),
        })),
      };
    }));
    const cities = [trip.destination, ...(Array.isArray(trip.additionalDestinations) ? trip.additionalDestinations : [])]
      .filter(Boolean).map((c: { name?: string; nights?: number | null }) => ({ name: String(c.name ?? ''), nights: typeof c.nights === 'number' ? c.nights : null }));
    const startMs = ms(trip.startDate);
    const startDay = typeof trip.startDay === 'string' ? trip.startDay : startMs != null ? new Date(startMs + 12 * 3_600_000).toISOString().slice(0, 10) : null;
    const { text: context, labels } = buildTripContext({
      title: String(trip.title ?? 'Trip'), startDay, today: new Date().toISOString().slice(0, 10),
      cities, days, bookings, topPlaces,
    });

    const turns: ModelTurn[] = [];
    for (const h of history.docs.reverse()) {
      const role = h.get('role') === 'assistant' ? 'model' : 'user';
      const status = h.get('status');
      turns.push({ role, text: role === 'model' ? JSON.stringify({ reply: h.get('text'), proposedChanges: (h.get('operations') ?? []).length, status }) : String(h.get('text')) });
    }
    turns.push({ role: 'user', text: `${context}\n\nREQUEST: ${message.trim()}` });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');
    const result = await generate({ system: TRIP_SYSTEM_PROMPT, turns, schema: AGENT_RESPONSE_SCHEMA, apiKey });
    const { ops, dropped } = validateTripOps(result.json.operations, labels);
    const allowed: AgentOp[] = filterByCapabilities(ops, capabilities);
    const totalDropped = dropped + (ops.length - allowed.length);
    const reply = totalDropped > 0
      ? `${result.json.reply}\n${totalDropped === 1 ? "1 suggestion didn't fit the trip." : `${totalDropped} suggestions didn't fit the trip.`}`
      : result.json.reply;

    console.log('agent', { uid, surface, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, operations: allowed.length, dropped: totalDropped });

    const now = admin.firestore.Timestamp.now();
    const base = { agentThread: threadId(surface, subjectId), surface, subjectId };
    const batch = db().batch();
    batch.set(thread.doc(`${requestId}_u`), { ...base, role: 'user', text: message.trim(), createdAt: now });
    batch.set(replyRef, { ...base, role: 'assistant', text: reply, operations: allowed, dropped: totalDropped, status: allowed.length ? 'proposed' : null, createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 1) });
    batch.set(quotaRef, { [policy.quotaKey]: admin.firestore.FieldValue.increment(1), agentInflightUntil: null }, { merge: true });
    await batch.commit();

    const q = (await quotaRef.get()).data();
    return { messageId: requestId, reply, operations: allowed, dropped: totalDropped, quota: quotaView(tier, q) };
  } catch (err) {
    console.error('agent failed', { uid, err: String(err) });
    await quotaRef.set({ agentInflightUntil: null }, { merge: true });
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('unavailable', FAIL);
  }
});

async function loadBookings(uid: string, tripId: string): Promise<CtxBooking[]> {
  const [passes, reservations, shared] = await Promise.all([
    db().collection('boarding_passes').where('ownerUid', '==', uid).where('tripId', '==', tripId).get(),
    db().collection('reservations').where('ownerUid', '==', uid).where('tripId', '==', tripId).get(),
    db().collection(`trips/${tripId}/bookings`).get(),
  ]);
  const out: CtxBooking[] = [];
  passes.docs.forEach((d) => { const b = bookingForContext('boarding_pass', d.data(), false); if (b) out.push(b); });
  reservations.docs.forEach((d) => { const b = bookingForContext('reservation', d.data(), false); if (b) out.push(b); });
  shared.docs.forEach((d) => {
    if (d.get('ownerUid') === uid) return; // our own, already above
    const kind = d.id.startsWith('boarding_pass_') ? 'boarding_pass' : 'reservation';
    const b = bookingForContext(kind, d.data(), true);
    if (b) out.push(b);
  });
  return out.slice(0, 20);
}

async function loadTopPlaces(trip: admin.firestore.DocumentData): Promise<CtxTopPlace[]> {
  const cities = [trip.destination, ...(Array.isArray(trip.additionalDestinations) ? trip.additionalDestinations : [])].filter(Boolean);
  const catalog = await loadCatalog();
  const perCity = cities.map((c: { lat?: number | null; lng?: number | null }) => destinationKeysFor([{ lat: c.lat ?? null, lng: c.lng ?? null }], catalog)[0] ?? null);
  const slugs = [...new Set(perCity.filter((s): s is string => !!s))];
  if (!slugs.length) return [];
  const docs = await db().getAll(...slugs.map((s) => db().doc(`destinations/${s}`)));
  const bySlug = new Map(docs.map((d) => [d.id, (d.get('topPlaces') as { name: string; type: string }[] | undefined) ?? []]));
  const out: CtxTopPlace[] = [];
  perCity.forEach((slug, i) => { if (slug) (bySlug.get(slug) ?? []).slice(0, 5).forEach((p) => out.push({ city: i, name: p.name, type: p.type })); });
  return out;
}

/** A deleted trip takes every member's private thread about it. */
export const onTripDeletedAgentThreads = onDocumentDeleted('trips/{tripId}', async (event) => {
  const snap = await db().collectionGroup('messages').where('agentThread', '==', `trip_${event.params.tripId}`).get();
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db().batch();
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
});
```

The Gemini key is read from `functions/.env` (`process.env.GEMINI_API_KEY`), exactly like `generateTrip`.

- [ ] **Step 2: Export**

Append to `functions/src/index.ts`:

```ts
export { agent, getAgentQuota, onTripDeletedAgentThreads } from './agentFunctions';
```

- [ ] **Step 3: Rules**

In `firestore.rules`, inside the `match /users/{uid} { … }` block, after `match /hidden/{contentKey} { … }`:

```
      // "Ask Supernova" threads (docs/superpowers/specs/2026-10-14-trip-agent-design.md).
      // Only the server writes messages; the owner may mark a proposal applied/dismissed.
      match /agentThreads/{threadId}/messages/{messageId} {
        allow read, delete: if isOwner(uid);
        allow update: if isOwner(uid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status'])
          && request.resource.data.status in ['applied', 'partial', 'dismissed'];
      }
```

- [ ] **Step 4: Index for the clean-up query**

Add to `fieldOverrides` in `firestore.indexes.json`:

```json
{
  "collectionGroup": "messages",
  "fieldPath": "agentThread",
  "indexes": [
    { "order": "ASCENDING", "queryScope": "COLLECTION" },
    { "order": "DESCENDING", "queryScope": "COLLECTION" },
    { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
  ]
}
```

- [ ] **Step 5: Build**

Run: `cd functions && npm run build`
Expected: exit 0, no TypeScript errors. Also `npx jest __tests__/functions` → all pass.

- [ ] **Step 6: Commit**

```bash
git add functions/src/agentFunctions.ts functions/src/index.ts firestore.rules firestore.indexes.json
git commit -m "feat(agent): agent and getAgentQuota callables, thread clean-up, rules and index"
```

---

### Task 6: AI consent version 2 with an `agent` purpose

**Files:**
- Modify: `functions/src/aiConsent.ts` (`AI_CONSENT_VERSION = 2`; doc comment: the agent added)
- Modify: `utils/aiConsent.ts` (`AI_CONSENT_VERSION = 2`; `export type AiPurpose = 'trip' | 'import' | 'agent';`)
- Modify: `components/ai/AiConsentSheet.tsx` (LEAD entry; "Also covers" lists both other purposes)
- Test: `__tests__/utils/aiConsent.test.ts` (add one test)

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```ts
  it('is version 2: the agent sends the trip, messages and booking names', () => {
    expect(SERVER_VERSION).toBe(2);
    expect(clientHas(1)).toBe(false);
  });
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/aiConsent.test.ts` — Expected: FAIL (`expected 2, received 1`).

- [ ] **Step 3: Implement**

`functions/src/aiConsent.ts` and `utils/aiConsent.ts`: `export const AI_CONSENT_VERSION = 2;` (add to the server comment: "2 (2026-10-14): Ask Supernova sends the trip, your messages and booking names/dates.").

`utils/aiConsent.ts`: `export type AiPurpose = 'trip' | 'import' | 'agent';`

`components/ai/AiConsentSheet.tsx` — add to `LEAD`:

```ts
  agent: {
    title: 'Ask Supernova',
    sends: "Your trip's cities, days and stops, what you ask, and the name, date and time of its bookings.",
  },
```

and replace the single `other` with every other purpose:

```ts
  const lead = LEAD[purpose ?? 'trip'];
  const others = (Object.keys(LEAD) as AiPurpose[]).filter((p) => p !== (purpose ?? 'trip')).map((p) => LEAD[p]);
```

with the "Also covers" row body:

```ts
    { Icon: Sparkle, title: 'Also covers', body: others.map((o) => `${o.title}: ${o.sends.charAt(0).toLowerCase()}${o.sends.slice(1)}`).join(' ') },
```

and the "Who receives it" body: `"Google, through its Gemini API, which writes the itinerary, reads the booking or answers your request and sends the result back to Supernova."`

- [ ] **Step 4: Run** `npx jest __tests__/utils/aiConsent.test.ts` — Expected: PASS. Run `npx tsc --noEmit -p .` — Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/aiConsent.ts utils/aiConsent.ts components/ai/AiConsentSheet.tsx __tests__/utils/aiConsent.test.ts
git commit -m "feat(agent): AI consent v2 covers Ask Supernova"
```

---

### Task 7: App types, service, proposal lines and suggestions

**Files:**
- Create: `types/agent.ts`
- Create: `services/agent.ts`
- Create: `utils/agentCard.ts`
- Test: `__tests__/utils/agentCard.test.ts`

**Interfaces:**
- Produces (`types/agent.ts`): the same `AgentOp`, `AgentQuotaView`, `AgentResponse`, `AgentStatus` as `functions/src/agentTypes.ts` (copy; header comment "Mirror of functions/src/agentTypes.ts — separate TS projects, keep in step"), plus
  `interface AgentMessage { id: string; role: 'user' | 'assistant'; text: string; operations: AgentOp[]; status: AgentStatus | null; createdAt: number }`
- Produces (`services/agent.ts`):
  - `AGENT_CAPABILITIES = ['trip.v1']`
  - `askAgent(a: { surface: 'trip'; subjectId: string; message: string; requestId: string }): Promise<AgentResponse>`
  - `fetchAgentQuota(): Promise<AgentQuotaView>`
- Produces (`utils/agentCard.ts`):
  - `interface OpLine { icon: 'add' | 'remove' | 'move' | 'reorder' | 'edit' | 'route' | 'dates'; type: ActivityType | null; text: string }`
  - `opLine(op: AgentOp, trip: TripWithDays): OpLine | null` (null when the op no longer matches the trip)
  - `agentSuggestions(trip: TripWithDays): string[]` (exactly 3)
  - `quotaLine(q: AgentQuotaView): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/agentCard.test.ts
import { opLine, agentSuggestions, quotaLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';

const stop = (id: string, title: string, type = 'activity', order = 1) =>
  ({ id, title, type, order, startTime: null, endTime: null, lat: 1, lng: 1, placeId: null, address: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null, mediaUrls: [] }) as any;
const trip = {
  id: 'T', title: 'Lisbon & Porto',
  destination: { name: 'Lisbon', nights: 3 }, additionalDestinations: [{ name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [stop('A', 'Belém Tower'), stop('B', 'Oceanário', 'activity', 2), stop('C', 'Feitoria', 'restaurant', 3), stop('E', 'Alfama walk', 'activity', 4)] },
    { id: 'D2', dayNumber: 2, destinationIndex: 0, activities: [stop('F', 'LX Factory')] },
  ],
} as unknown as TripWithDays;

describe('opLine', () => {
  it('writes each change as one short line', () => {
    expect(opLine({ kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null }, trip))
      .toEqual({ icon: 'add', type: 'restaurant', text: 'Day 2 · Dinner at Ramiro' });
    expect(opLine({ kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' }, trip)?.text).toBe('Day 1 · Remove Oceanário');
    expect(opLine({ kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null }, trip)?.text).toBe('Move Belém Tower to day 2');
    expect(opLine({ kind: 'trip.updateStop', dayId: 'D1', stopId: 'C', time: '20:00' }, trip)?.text).toBe('Day 1 · Feitoria at 20:00');
    expect(opLine({ kind: 'trip.setNights', city: 0, nights: 4 }, trip)?.text).toBe('Lisbon 3 → 4 nights');
    expect(opLine({ kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 }, trip)?.text).toBe('Add Sintra, 1 night, after Lisbon');
    expect(opLine({ kind: 'trip.shiftDates', newStart: '2026-11-04' }, trip)?.text).toBe('Start the trip on Wed, Nov 4');
  });
  it('returns null for a change that no longer fits the trip', () => {
    expect(opLine({ kind: 'trip.removeStop', dayId: 'D1', stopId: 'ZZ' }, trip)).toBeNull();
    expect(opLine({ kind: 'trip.setNights', city: 5, nights: 2 }, trip)).toBeNull();
  });
});

describe('agentSuggestions', () => {
  it('builds three requests from the trip itself', () => {
    const s = agentSuggestions(trip);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe('Make day 1 less rushed');
    expect(s).toContain('Add a night in Porto');
  });
});

describe('quotaLine', () => {
  it('counts down for free, stays quiet for Pro until close', () => {
    expect(quotaLine({ used: 6, limit: 10, fairUse: false, resetsAt: '' })).toBe('4 of 10 left this month');
    expect(quotaLine({ used: 10, limit: 300, fairUse: true, resetsAt: '' })).toBeNull();
    expect(quotaLine({ used: 280, limit: 300, fairUse: true, resetsAt: '' })).toBe('20 left this month');
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/agentCard.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`types/agent.ts`: copy `ActivityType` from `@/types` (import it, don't redeclare), and declare `AgentOp`, `AgentStatus`, `AgentQuotaView`, `AgentResponse` exactly as in Task 2, plus `AgentMessage` above.

`services/agent.ts`:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type { AgentQuotaView, AgentResponse } from '@/types/agent';

/** What this build can apply (spec "Built to grow"): the server never sends an operation outside it. */
export const AGENT_CAPABILITIES = ['trip.v1'];

export async function askAgent(a: { surface: 'trip'; subjectId: string; message: string; requestId: string }): Promise<AgentResponse> {
  const call = httpsCallable<object, AgentResponse>(functions, 'agent', { timeout: 60_000 });
  const res = await call({ ...a, capabilities: AGENT_CAPABILITIES });
  return res.data;
}

export async function fetchAgentQuota(): Promise<AgentQuotaView> {
  const res = await httpsCallable<object, AgentQuotaView>(functions, 'getAgentQuota')({});
  return res.data;
}
```

`utils/agentCard.ts`:

```ts
import type { ActivityType, TripWithDays } from '@/types';
import type { AgentOp, AgentQuotaView } from '@/types/agent';
import { parseCalendarDate } from '@/utils/calendarDate';

export interface OpLine { icon: 'add' | 'remove' | 'move' | 'reorder' | 'edit' | 'route' | 'dates'; type: ActivityType | null; text: string }

const cities = (t: TripWithDays) => [t.destination, ...t.additionalDestinations];
const dayOf = (t: TripWithDays, id: string) => t.days.find((d) => d.id === id) ?? null;
const stopOf = (t: TripWithDays, dayId: string, id: string) => dayOf(t, dayId)?.activities.find((a) => a.id === id) ?? null;
const nightsWord = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

export function opLine(op: AgentOp, trip: TripWithDays): OpLine | null {
  switch (op.kind) {
    case 'trip.addStop': {
      const d = dayOf(trip, op.dayId);
      return d ? { icon: 'add', type: op.type, text: `Day ${d.dayNumber} · ${op.title}${op.time ? ` at ${op.time}` : ''}` } : null;
    }
    case 'trip.removeStop': {
      const d = dayOf(trip, op.dayId); const s = stopOf(trip, op.dayId, op.stopId);
      return d && s ? { icon: 'remove', type: s.type, text: `Day ${d.dayNumber} · Remove ${s.title}` } : null;
    }
    case 'trip.moveStop': {
      const s = stopOf(trip, op.dayId, op.stopId); const to = dayOf(trip, op.toDayId);
      return s && to ? { icon: 'move', type: s.type, text: `Move ${s.title} to day ${to.dayNumber}` } : null;
    }
    case 'trip.reorderDay': {
      const d = dayOf(trip, op.dayId);
      return d ? { icon: 'reorder', type: null, text: `Day ${d.dayNumber} · New order` } : null;
    }
    case 'trip.updateStop': {
      const d = dayOf(trip, op.dayId); const s = stopOf(trip, op.dayId, op.stopId);
      if (!d || !s) return null;
      const what = op.time !== undefined ? (op.time ? `${s.title} at ${op.time}` : `${s.title}, no time`) : `Note on ${s.title}`;
      return { icon: 'edit', type: s.type, text: `Day ${d.dayNumber} · ${what}` };
    }
    case 'trip.setNights': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `${c.name} ${c.nights ?? '?'} → ${nightsWord(op.nights)}` } : null;
    }
    case 'trip.addCity': {
      const after = op.afterCity != null ? cities(trip)[op.afterCity] : null;
      return { icon: 'route', type: null, text: `Add ${op.name}, ${nightsWord(op.nights)}${after ? `, after ${after.name}` : ''}` };
    }
    case 'trip.removeCity': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `Remove ${c.name}` } : null;
    }
    case 'trip.moveCity': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `Visit ${c.name} ${op.by < 0 ? 'earlier' : 'later'}` } : null;
    }
    case 'trip.shiftDates': {
      const d = parseCalendarDate(op.newStart);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return { icon: 'dates', type: null, text: `Start the trip on ${label}` };
    }
  }
}

/** Three requests built from the trip: its busiest day, a food idea, and the route. */
export function agentSuggestions(trip: TripWithDays): string[] {
  const busiest = [...trip.days].sort((a, b) => b.activities.length - a.activities.length || a.dayNumber - b.dayNumber)[0];
  const list = cities(trip);
  const out = [
    busiest ? `Make day ${busiest.dayNumber} less rushed` : 'Plan a relaxed first day',
    `Find a great dinner in ${list[0]?.name ?? 'town'}`,
    list.length > 1 ? `Add a night in ${list[list.length - 1].name}` : `What should we not miss in ${list[0]?.name ?? 'town'}?`,
  ];
  return out;
}

export function quotaLine(q: AgentQuotaView): string | null {
  const left = Math.max(0, q.limit - q.used);
  if (!q.fairUse) return `${left} of ${q.limit} left this month`;
  return left <= 30 ? `${left} left this month` : null;
}
```

(`parseCalendarDate` already exists in `utils/calendarDate.ts` and returns a local `Date` for a `YYYY-MM-DD` string.)

- [ ] **Step 4: Run** `npx jest __tests__/utils/agentCard.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add types/agent.ts services/agent.ts utils/agentCard.ts __tests__/utils/agentCard.test.ts
git commit -m "feat(agent): app types, callable service, proposal lines and suggestions"
```

---

### Task 8: Planning how a proposal is applied (pure) — order, re-checks, route, undo

**Files:**
- Create: `utils/agentApply.ts`
- Test: `__tests__/utils/agentApply.test.ts`

**Interfaces:**
- Consumes: `AgentOp` (Task 7); `RouteRow`, `setRowNights`, `moveRow`, `removeRow`, `addRow` (`@/utils/tripRoute`); `routeRowsFromTrip` is in a hook file, so this module takes rows as input.
- Produces:

```ts
export type ApplyStep =
  | { do: 'delete'; dayId: string; activity: TripActivity }
  | { do: 'move'; fromDayId: string; toDayId: string; activity: TripActivity; afterStopId: string | null }
  | { do: 'reorder'; dayId: string; before: TripActivity[]; after: TripActivity[] }
  | { do: 'update'; dayId: string; activityId: string; patch: Partial<TripActivity>; before: Partial<TripActivity> }
  | { do: 'add'; dayId: string; activity: Omit<TripActivity, 'id' | 'order' | 'createdAt'>; order: number }
  | { do: 'dates'; newStart: string; previousStart: string | null };
export interface ApplyPlan { steps: ApplyStep[]; routeOps: AgentOp[]; skipped: AgentOp[] }
export function planApply(trip: TripWithDays, ops: AgentOp[]): ApplyPlan
export function orderAfter(stops: TripActivity[], afterStopId: string | null): number
export function applyRouteOps<T>(rows: RouteRow<T>[], ops: AgentOp[], newPlace: (name: string) => T | null): { rows: RouteRow<T>[]; skipped: AgentOp[] }
export function undoSteps(steps: ApplyStep[], addedIds: Record<number, string>): ApplyStep[]
```

Rulings carried from the spec: **Undo covers stop and date changes**; a proposal with route changes is confirmed (as in the route editor) and has no Undo, because a route save deletes days and their stops can't be restored by a later save.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/utils/agentApply.test.ts
import { planApply, orderAfter, applyRouteOps, undoSteps } from '@/utils/agentApply';
import type { TripWithDays } from '@/types';

const stop = (id: string, title: string, order: number, type = 'activity') =>
  ({ id, title, type, order, startTime: null, endTime: null, lat: 1, lng: 1, placeId: null, address: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null, mediaUrls: [] }) as any;
const trip = {
  id: 'T', startDate: null, startDay: '2026-11-02',
  destination: { name: 'Lisbon', nights: 2 }, additionalDestinations: [{ name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [stop('A', 'Belém Tower', 1000), stop('B', 'Oceanário', 2000)] },
    { id: 'D2', dayNumber: 2, destinationIndex: 0, activities: [stop('C', 'LX Factory', 1000)] },
    { id: 'D3', dayNumber: 3, destinationIndex: 1, activities: [] },
  ],
} as unknown as TripWithDays;

describe('orderAfter', () => {
  it('places between neighbours, first, or at the end', () => {
    const s = trip.days[0].activities;
    expect(orderAfter(s, 'A')).toBe(1500);
    expect(orderAfter(s, 'B')).toBe(3000);
    expect(orderAfter(s, null)).toBe(3000);
    expect(orderAfter([], null)).toBe(1000);
  });
});

describe('planApply', () => {
  it('orders removals, moves, updates, then additions; route kept apart', () => {
    const p = planApply(trip, [
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null },
      { kind: 'trip.setNights', city: 0, nights: 3 },
      { kind: 'trip.updateStop', dayId: 'D2', stopId: 'C', time: '10:00' },
      { kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
    ]);
    expect(p.steps.map((s) => s.do)).toEqual(['delete', 'move', 'update', 'add']);
    expect(p.routeOps.map((o) => o.kind)).toEqual(['trip.setNights']);
    expect(p.skipped).toEqual([]);
  });
  it('builds a new stop the way the background grounding expects', () => {
    const p = planApply(trip, [{ kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: 'C', time: null }]);
    const add = p.steps[0] as any;
    expect(add.activity).toMatchObject({ type: 'restaurant', title: 'Dinner at Ramiro', lat: null, lng: null, placeId: null, startTime: null, searchQuery: 'Dinner at Ramiro, Lisbon' });
    expect(add.activity.titleSource).toBeUndefined();
    expect(add.order).toBe(2000);
  });
  it('skips operations whose stop no longer exists', () => {
    const p = planApply(trip, [
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'GONE' },
      { kind: 'trip.addStop', dayId: 'D9', title: 'Somewhere', type: 'activity', afterStopId: null, time: null },
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
    ]);
    expect(p.steps).toHaveLength(1);
    expect(p.skipped).toHaveLength(2);
  });
  it('skips a reorder whose day changed since', () => {
    const p = planApply(trip, [{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A', 'X'] }]);
    expect(p.skipped).toHaveLength(1);
    const ok = planApply(trip, [{ kind: 'trip.reorderDay', dayId: 'D1', stopIds: ['B', 'A'] }]);
    expect((ok.steps[0] as any).after.map((a: any) => a.id)).toEqual(['B', 'A']);
  });
  it('records what an update replaces, for undo', () => {
    const p = planApply(trip, [{ kind: 'trip.updateStop', dayId: 'D1', stopId: 'A', time: '09:00', notes: 'Early' }]);
    expect(p.steps[0]).toMatchObject({ do: 'update', patch: { startTime: '09:00', notes: 'Early' }, before: { startTime: null, notes: '' } });
  });
});

describe('applyRouteOps', () => {
  const rows = [
    { key: '0', from: 0, nights: 2, absorbs: [], absorbsAfter: [], place: 'Lisbon' },
    { key: '1', from: 1, nights: 2, absorbs: [], absorbsAfter: [], place: 'Porto' },
  ];
  it('applies nights, moves, additions and removals by original city index', () => {
    const r = applyRouteOps(rows as any, [
      { kind: 'trip.setNights', city: 1, nights: 3 },
      { kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 },
      { kind: 'trip.moveCity', city: 1, by: -1 },
    ], (name) => name);
    // Sintra goes in after Lisbon ([Lisbon, Sintra, Porto]); then Porto moves one earlier.
    expect(r.rows.map((x: any) => x.place)).toEqual(['Lisbon', 'Porto', 'Sintra']);
    expect(r.rows.find((x: any) => x.place === 'Sintra')?.nights).toBeGreaterThanOrEqual(1);
    expect(r.skipped).toEqual([]);
  });
  it('skips a city it cannot place', () => {
    const r = applyRouteOps(rows as any, [{ kind: 'trip.addCity', name: 'Atlantis', nights: 1, afterCity: null }], () => null);
    expect(r.skipped).toHaveLength(1);
    expect(r.rows).toHaveLength(2);
  });
});

describe('undoSteps', () => {
  it('reverses each step in reverse order', () => {
    const p = planApply(trip, [
      { kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' },
      { kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null },
    ]);
    const u = undoSteps(p.steps, { 1: 'NEW1' });
    expect(u.map((s) => s.do)).toEqual(['delete', 'add']);
    expect((u[0] as any).activity.id).toBe('NEW1');
    expect((u[1] as any).activity.title).toBe('Oceanário');
    expect((u[1] as any).order).toBe(2000);
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/agentApply.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `utils/agentApply.ts`:

```ts
/**
 * Turns accepted agent operations into steps on the existing trip mutations
 * (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "App: applying a proposal").
 * Pure: re-checks every operation against the trip as it is now.
 */
import type { TripActivity, TripWithDays } from '@/types';
import type { AgentOp } from '@/types/agent';
import { addRow, moveRow, removeRow, setRowNights, type RouteRow } from '@/utils/tripRoute';
import { manualSearchQuery } from '@/utils/groundingQueue';

export type ApplyStep =
  | { do: 'delete'; dayId: string; activity: TripActivity }
  | { do: 'move'; fromDayId: string; toDayId: string; activity: TripActivity; afterStopId: string | null }
  | { do: 'reorder'; dayId: string; before: TripActivity[]; after: TripActivity[] }
  | { do: 'update'; dayId: string; activityId: string; patch: Partial<TripActivity>; before: Partial<TripActivity> }
  | { do: 'add'; dayId: string; activity: Omit<TripActivity, 'id' | 'order' | 'createdAt'>; order: number }
  | { do: 'dates'; newStart: string; previousStart: string | null };

export interface ApplyPlan { steps: ApplyStep[]; routeOps: AgentOp[]; skipped: AgentOp[] }

const STEP = 1000;
const RANK: Record<string, number> = { delete: 0, move: 1, reorder: 1, update: 2, dates: 3, add: 4 };

export function orderAfter(stops: TripActivity[], afterStopId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  if (!sorted.length) return STEP;
  const i = afterStopId ? sorted.findIndex((s) => s.id === afterStopId) : -1;
  if (i < 0 || i === sorted.length - 1) return sorted[sorted.length - 1].order + STEP;
  return (sorted[i].order + sorted[i + 1].order) / 2;
}

export function planApply(trip: TripWithDays, ops: AgentOp[]): ApplyPlan {
  const steps: ApplyStep[] = [];
  const routeOps: AgentOp[] = [];
  const skipped: AgentOp[] = [];
  const day = (id: string) => trip.days.find((d) => d.id === id) ?? null;
  const cityName = (dayId: string) => {
    const d = day(dayId);
    const list = [trip.destination, ...trip.additionalDestinations];
    return list[d?.destinationIndex ?? 0]?.name ?? list[0]?.name ?? null;
  };

  for (const op of ops) {
    switch (op.kind) {
      case 'trip.removeStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (a) steps.push({ do: 'delete', dayId: op.dayId, activity: a }); else skipped.push(op);
        break;
      }
      case 'trip.moveStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (a && day(op.toDayId)) steps.push({ do: 'move', fromDayId: op.dayId, toDayId: op.toDayId, activity: a, afterStopId: op.afterStopId });
        else skipped.push(op);
        break;
      }
      case 'trip.reorderDay': {
        const d = day(op.dayId);
        const current = [...(d?.activities ?? [])].sort((a, b) => a.order - b.order);
        const ids = new Set(current.map((a) => a.id));
        if (!d || op.stopIds.length !== current.length || !op.stopIds.every((id) => ids.has(id))) { skipped.push(op); break; }
        steps.push({ do: 'reorder', dayId: d.id, before: current, after: op.stopIds.map((id) => current.find((a) => a.id === id)!) });
        break;
      }
      case 'trip.updateStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (!a) { skipped.push(op); break; }
        const patch: Partial<TripActivity> = {};
        const before: Partial<TripActivity> = {};
        if (op.time !== undefined) { patch.startTime = op.time; before.startTime = a.startTime; }
        if (op.notes !== undefined) { patch.notes = op.notes; before.notes = a.notes; }
        steps.push({ do: 'update', dayId: op.dayId, activityId: a.id, patch, before });
        break;
      }
      case 'trip.addStop': {
        const d = day(op.dayId);
        if (!d) { skipped.push(op); break; }
        steps.push({
          do: 'add', dayId: d.id, order: orderAfter(d.activities, op.afterStopId),
          activity: {
            type: op.type, title: op.title, placeId: null, address: null, lat: null, lng: null,
            startTime: op.time, endTime: null, durationMinutes: null, notes: '', bookingRef: null,
            cost: null, currency: null, mediaUrls: [],
            searchQuery: manualSearchQuery(op.type, op.title, cityName(d.id)),
          } as Omit<TripActivity, 'id' | 'order' | 'createdAt'>,
        });
        break;
      }
      case 'trip.shiftDates':
        steps.push({ do: 'dates', newStart: op.newStart, previousStart: (trip as { startDay?: string | null }).startDay ?? null });
        break;
      default:
        routeOps.push(op);
    }
  }
  steps.sort((a, b) => RANK[a.do] - RANK[b.do]);
  return { steps, routeOps, skipped };
}

/** Route operations refer to cities by their index when proposed; rows keep it in `from`. */
export function applyRouteOps<T>(rows: RouteRow<T>[], ops: AgentOp[], newPlace: (name: string) => T | null): { rows: RouteRow<T>[]; skipped: AgentOp[] } {
  let out = rows;
  const skipped: AgentOp[] = [];
  const at = (city: number) => out.findIndex((r) => r.from === city);
  let n = 0;
  for (const op of ops) {
    switch (op.kind) {
      case 'trip.setNights': { const i = at(op.city); if (i < 0) skipped.push(op); else out = setRowNights(out, i, op.nights); break; }
      case 'trip.moveCity': { const i = at(op.city); if (i < 0) skipped.push(op); else out = moveRow(out, i, op.by); break; }
      case 'trip.removeCity': { const i = at(op.city); if (i < 0 || out.length < 2) skipped.push(op); else out = removeRow(out, i, op.mode); break; }
      case 'trip.addCity': {
        // Append, then step into place with moveRow — the editor's own helpers, which keep the
        // last city's departure-day night right (relast) at every step.
        const place = newPlace(op.name);
        if (place == null) { skipped.push(op); break; }
        out = addRow(out, place, `agent-${n++}`);
        let i = out.length - 1;
        const after = op.afterCity != null ? out.findIndex((r) => r.from === op.afterCity) : -1;
        while (after >= 0 && i > after + 1) { out = moveRow(out, i, -1); i -= 1; }
        out = setRowNights(out, i, op.nights);
        break;
      }
      default: skipped.push(op);
    }
  }
  return { rows: out, skipped };
}

/** The steps that put things back, newest first. `addedIds[i]` is the id created by step i (an 'add' or a 'move'). */
export function undoSteps(steps: ApplyStep[], addedIds: Record<number, string>): ApplyStep[] {
  const out: ApplyStep[] = [];
  steps.forEach((s, i) => {
    switch (s.do) {
      case 'add': {
        const id = addedIds[i];
        if (id) out.unshift({ do: 'delete', dayId: s.dayId, activity: { ...(s.activity as TripActivity), id, order: s.order } });
        break;
      }
      case 'delete': {
        const { id: _id, order, createdAt: _c, ...rest } = s.activity;
        out.unshift({ do: 'add', dayId: s.dayId, activity: rest, order });
        break;
      }
      case 'move': {
        const id = addedIds[i];
        if (id) out.unshift({ do: 'move', fromDayId: s.toDayId, toDayId: s.fromDayId, activity: { ...s.activity, id }, afterStopId: null });
        break;
      }
      case 'reorder': out.unshift({ do: 'reorder', dayId: s.dayId, before: s.after, after: s.before }); break;
      case 'update': out.unshift({ do: 'update', dayId: s.dayId, activityId: s.activityId, patch: s.before, before: s.patch }); break;
      case 'dates': if (s.previousStart) out.unshift({ do: 'dates', newStart: s.previousStart, previousStart: s.newStart }); break;
    }
  });
  return out;
}
```

Nights move when the last city changes (`relast` in `utils/tripRoute.ts` keeps the departure day with the last city), so the route test asserts the order and that every city keeps at least one night, not exact counts after moves.

- [ ] **Step 4: Run** `npx jest __tests__/utils/agentApply.test.ts` — Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/agentApply.ts __tests__/utils/agentApply.test.ts
git commit -m "feat(agent): plan how a proposal applies — order, re-checks, route rows, undo"
```

---

### Task 9: `useAgent` — thread, send, apply, undo, clear

**Files:**
- Create: `hooks/useAgent.ts`
- Modify: `services/places/mapboxSearch.ts` (add `resolveCityByName`)

**Interfaces:**
- Consumes: Tasks 7–8; `useCreateTrip` (`addActivity(tripId, dayId, activity, order)`, `deleteActivity(tripId, dayId, id, fromBooking?)`, `updateActivity(tripId, dayId, id, data)`, `reorderActivities(tripId, dayId, ordered)`, `moveActivityToDay(tripId, from, to, activity)`, `updateTrip(tripId, data)`); `useTripRoute().saveRoute(trip, draft)`; `routeRowsFromTrip`, `draftFromRows`, `previewRoute` (`@/hooks/useTripRoute`); `buildMapboxForwardUrl` (already in `mapboxSearch.ts`); `parseCalendarDate`, `endDateFor` (`@/utils/tripRoute`).
- Produces:

```ts
export function useAgent(a: { surface: 'trip'; trip: TripWithDays | null; enabled: boolean }): {
  messages: AgentMessage[]; loading: boolean; sending: boolean; error: string | null;
  quota: AgentQuotaView | null;
  send: (text: string) => Promise<'ok' | 'limit' | 'error'>;
  apply: (messageId: string, ops: AgentOp[], confirmDrops: (text: string) => Promise<boolean>) => Promise<{ applied: number; skipped: number; undo: (() => Promise<void>) | null }>;
  dismiss: (messageId: string) => Promise<void>;
  clear: () => Promise<void>;
}
export async function resolveCityByName(name: string, near?: { lat: number; lng: number } | null): Promise<Destination | null>  // mapboxSearch.ts
```

- [ ] **Step 1: Add `resolveCityByName`** to `services/places/mapboxSearch.ts`:

```ts
/** A city by name, for an agent proposal ("Add a night in Sintra"). Free on the Search Box tier. */
export async function resolveCityByName(name: string, near?: { lat: number; lng: number } | null): Promise<Destination | null> {
  if (!TOKEN || !name.trim()) return null;
  try {
    const res = await fetch(buildMapboxForwardUrl({ query: name, token: TOKEN, country: null, types: 'place,locality', limit: 1, proximity: near ?? null }));
    if (!res.ok) return null;
    const f = ((await res.json()) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; context?: { country?: { country_code?: string } } } }[] }).features?.[0];
    const c = f?.geometry?.coordinates;
    if (!c) return null;
    return { name: f?.properties?.name ?? name, placeId: null, lat: c[1], lng: c[0], countryCode: f?.properties?.context?.country?.country_code?.toUpperCase() ?? null, bounds: null };
  } catch {
    return null;
  }
}
```

Read `buildMapboxForwardUrl`'s parameter type first; if it has no `proximity` field, drop that property (and the `near` parameter) rather than adding one, and record a ruling. Import `Destination` from `@/types` if the file doesn't already.

- [ ] **Step 2: Write `hooks/useAgent.ts`**

```ts
import { useCallback, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/services/firebase';
import { askAgent, fetchAgentQuota } from '@/services/agent';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { draftFromRows, previewRoute, routeRowsFromTrip, useTripRoute } from '@/hooks/useTripRoute';
import { resolveCityByName } from '@/services/places/mapboxSearch';
import { applyRouteOps, planApply, undoSteps, type ApplyStep } from '@/utils/agentApply';
import { dropsWarning, endDateFor } from '@/utils/tripRoute';
import { parseCalendarDate } from '@/utils/calendarDate';
import type { Destination, TripWithDays } from '@/types';
import type { AgentMessage, AgentOp, AgentQuotaView } from '@/types/agent';

const threadPath = (uid: string, tripId: string) => `users/${uid}/agentThreads/trip_${tripId}/messages`;

export function useAgent({ trip, enabled }: { surface: 'trip'; trip: TripWithDays | null; enabled: boolean }) {
  const uid = auth.currentUser?.uid ?? null;
  const tripId = trip?.id ?? null;
  const qc = useQueryClient();
  const trips = useCreateTrip();
  const { saveRoute } = useTripRoute();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AgentMessage | null>(null);

  const key = ['agentThread', uid, tripId];
  const thread = useQuery({
    queryKey: key,
    enabled: enabled && !!uid && !!tripId,
    queryFn: async (): Promise<AgentMessage[]> => {
      const snap = await getDocs(query(collection(db, threadPath(uid!, tripId!)), orderBy('createdAt', 'desc'), limit(30)));
      return snap.docs.reverse().map((d) => ({
        id: d.id, role: d.get('role'), text: d.get('text') ?? '', operations: d.get('operations') ?? [],
        status: d.get('status') ?? null, createdAt: (d.get('createdAt') as Timestamp | undefined)?.toMillis() ?? 0,
      }));
    },
  });
  const quota = useQuery({ queryKey: ['agentQuota', uid], enabled: enabled && !!uid, queryFn: fetchAgentQuota, staleTime: 60_000 });

  const send = useCallback(async (text: string): Promise<'ok' | 'limit' | 'error'> => {
    if (!uid || !tripId || !text.trim() || sending) return 'error';
    setSending(true); setError(null);
    setPending({ id: 'pending', role: 'user', text: text.trim(), operations: [], status: null, createdAt: Date.now() });
    try {
      const requestId = doc(collection(db, 'trips')).id;
      const res = await askAgent({ surface: 'trip', subjectId: tripId, message: text.trim(), requestId });
      qc.setQueryData(['agentQuota', uid], res.quota);
      await qc.invalidateQueries({ queryKey: key });
      return 'ok';
    } catch (e: unknown) {
      const details = (e as { details?: { reason?: string; fairUse?: boolean } }).details;
      if (details?.reason === 'monthly' && !details.fairUse) { setError((e as Error).message); return 'limit'; }
      setError((e as Error).message || "Supernova couldn't answer right now. Try again.");
      return 'error';
    } finally {
      setPending(null); setSending(false);
    }
  }, [uid, tripId, sending, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSteps = useCallback(async (steps: ApplyStep[]): Promise<Record<number, string>> => {
    const added: Record<number, string> = {};
    for (const [i, s] of steps.entries()) {
      switch (s.do) {
        case 'delete': await trips.deleteActivity(trip!.id, s.dayId, s.activity.id, s.activity.fromBooking); break;
        case 'move': {
          await trips.moveActivityToDay(trip!.id, s.fromDayId, s.toDayId, s.activity);
          break;
        }
        case 'reorder': await trips.reorderActivities(trip!.id, s.dayId, s.after); break;
        case 'update': await trips.updateActivity(trip!.id, s.dayId, s.activityId, s.patch); break;
        case 'add': added[i] = await trips.addActivity(trip!.id, s.dayId, { ...s.activity, createdAt: Timestamp.now() }, s.order); break;
        case 'dates': {
          const total = [trip!.destination, ...trip!.additionalDestinations].reduce((n, c) => n + (c.nights ?? 0), 0);
          await trips.updateTrip(trip!.id, { startDate: parseCalendarDate(s.newStart), endDate: total ? parseCalendarDate(endDateFor(s.newStart, total)) : undefined });
          break;
        }
      }
    }
    return added;
  }, [trip, trips]);

  const apply = useCallback(async (messageId: string, ops: AgentOp[], confirmDrops: (text: string) => Promise<boolean>) => {
    if (!trip || !uid) return { applied: 0, skipped: ops.length, undo: null };
    const plan = planApply(trip, ops);
    let skipped = plan.skipped.length;

    // Route first is confirmed (it may delete days with stops); then stop steps on the saved trip.
    if (plan.routeOps.length) {
      const near = trip.destination.lat != null && trip.destination.lng != null ? { lat: trip.destination.lat, lng: trip.destination.lng } : null;
      const places = new Map<string, Destination | null>();
      for (const op of plan.routeOps) if (op.kind === 'trip.addCity') places.set(op.name, await resolveCityByName(op.name, near));
      const routed = applyRouteOps(routeRowsFromTrip(trip), plan.routeOps, (name) => places.get(name) ?? null);
      skipped += routed.skipped.length;
      const draft = draftFromRows(routed.rows);
      const preview = previewRoute(trip, draft);
      const names = [trip.destination, ...trip.additionalDestinations].map((c) => c.name);
      if (preview.dropsWithStops.length && !(await confirmDrops(dropsWarning(preview.dropsWithStops, names)))) {
        return { applied: 0, skipped: ops.length, undo: null };
      }
      await saveRoute(trip, draft);
    }

    const added = await runSteps(plan.steps);
    const applied = ops.length - skipped;
    await updateDoc(doc(db, threadPath(uid, trip.id), messageId), { status: skipped ? 'partial' : 'applied' });
    await qc.invalidateQueries({ queryKey: key });

    const undo = plan.routeOps.length ? null : async () => {
      await runSteps(undoSteps(plan.steps, added));
      await updateDoc(doc(db, threadPath(uid, trip.id), messageId), { status: 'dismissed' });
      await qc.invalidateQueries({ queryKey: key });
    };
    return { applied, skipped, undo };
  }, [trip, uid, saveRoute, runSteps, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(async (messageId: string) => {
    if (!uid || !tripId) return;
    await updateDoc(doc(db, threadPath(uid, tripId), messageId), { status: 'dismissed' });
    await qc.invalidateQueries({ queryKey: key });
  }, [uid, tripId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(async () => {
    if (!uid || !tripId) return;
    const snap = await getDocs(query(collection(db, threadPath(uid, tripId)), limit(500)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await qc.invalidateQueries({ queryKey: key });
  }, [uid, tripId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = [...(thread.data ?? []), ...(pending ? [pending] : [])];
  return { messages, loading: thread.isLoading, sending, error, quota: (quota.data as AgentQuotaView | undefined) ?? null, send, apply, dismiss, clear };
}
```

Before relying on them, open `utils/tripRoute.ts` and confirm the names `dropsWarning` and `endDateFor` and `previewRoute(...).dropsWithStops` (the route editor imports `dropsWarning` from there). For a 'move' step the undo needs the moved stop's new id: `moveActivityToDay` creates a new doc and returns `Promise<void>`. Change `moveActivityToDay` in `hooks/useCreateTrip.ts` to `return newActivityRef.id;` (type `Promise<string | undefined>`, `undefined` when `fromDayId === toDayId`) and record `added[i]` from it — existing callers ignore the return value.

- [ ] **Step 3: Type-check and run the suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "useAgent|agentApply|mapboxSearch|useCreateTrip" ; npx jest`
Expected: no type errors from these files; all suites pass.

- [ ] **Step 4: Commit**

```bash
git add hooks/useAgent.ts hooks/useCreateTrip.ts services/places/mapboxSearch.ts
git commit -m "feat(agent): useAgent — thread, send, apply through existing trip edits, undo, clear"
```

---

### Task 10: The sheet, the proposal card, and the trip page entry

**Files:**
- Create: `components/agent/AgentSheet.tsx`
- Create: `components/agent/ProposalCard.tsx`
- Modify: `app/trip/[id].tsx` (button + sheet; near the existing Share/trip actions, only when `canEditItinerary`)

**Interfaces:**
- Consumes: `useAgent` (Task 9), `opLine`, `agentSuggestions`, `quotaLine` (Task 7), `useAiConsentGate().requireConsent('agent', …)` + `consentSheet`, `useLimitPaywall()`, `ACTIVITY_ICONS` (`@/constants/icons`), `useTheme`.
- Produces: `<AgentSheet visible trip onClose />`, `<ProposalCard message trip onApply onDismiss />`.

Read `.claude/skills/supernova-design/SKILL.md` before writing UI and run its pre-ship checklist at the end of this task.

- [ ] **Step 1: `ProposalCard`**

```tsx
// components/agent/ProposalCard.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowsDownUp, ArrowRight, CalendarBlank, CheckSquare, MapTrifold, Minus, PencilSimple, Plus, Square } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { Button } from '@/components/ui/Button';
import { opLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';
import type { AgentMessage, AgentOp } from '@/types/agent';

const ICON = { add: Plus, remove: Minus, move: ArrowRight, reorder: ArrowsDownUp, edit: PencilSimple, route: MapTrifold, dates: CalendarBlank } as const;

export function ProposalCard({ message, trip, busy, onApply, onDismiss }: {
  message: AgentMessage; trip: TripWithDays; busy: boolean;
  onApply: (ops: AgentOp[]) => void; onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const lines = useMemo(() => message.operations.map((op) => ({ op, line: opLine(op, trip) })), [message.operations, trip]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const done = message.status && message.status !== 'proposed';
  const chosen = lines.filter((l, i) => l.line && !off.has(i)).map((l) => l.op);

  const toggle = useCallback((i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOff((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }, []);
  const apply = useCallback(() => onApply(chosen), [onApply, chosen]);

  return (
    <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{done ? (message.status === 'dismissed' ? 'NOT APPLIED' : 'APPLIED') : 'PROPOSED CHANGES'}</Text>
      {lines.map(({ line }, i) => {
        if (!line) return <Text key={i} style={[styles.stale, { color: colors.text.tertiary }]}>This change no longer fits the trip</Text>;
        const TypeIcon = line.type ? ACTIVITY_ICONS[line.type] : null;
        const Glyph = ICON[line.icon];
        const on = !off.has(i);
        return (
          <TouchableOpacity key={i} disabled={!!done} onPress={() => toggle(i)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={line.text}>
            {!done && (on ? <CheckSquare size={20} color={colors.text.primary} weight="fill" /> : <Square size={20} color={colors.text.tertiary} />)}
            {TypeIcon ? <TypeIcon.Icon size={18} color={TypeIcon.color} weight="duotone" /> : <Glyph size={18} color={colors.text.secondary} weight="bold" />}
            <Text style={[styles.line, { color: on || done ? colors.text.primary : colors.text.tertiary }]} numberOfLines={2}>{line.text}</Text>
          </TouchableOpacity>
        );
      })}
      {!done && (
        <View style={styles.actions}>
          <Button label={chosen.length === 1 ? 'Apply 1 change' : `Apply ${chosen.length} changes`} onPress={apply} loading={busy} disabled={!chosen.length || busy} size="md" />
          <TouchableOpacity onPress={onDismiss} style={styles.textLink} accessibilityRole="button"><Text style={{ color: colors.text.secondary }}>Not now</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10, marginTop: 8 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  line: { flex: 1, fontSize: 15, lineHeight: 21 },
  stale: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  textLink: { minHeight: 44, justifyContent: 'center' },
});
```

Check `ACTIVITY_ICONS[type]`'s actual shape in `constants/icons.ts` (`{ Icon, color }`) and the `Button` props (`label`, `onPress`, `loading`, `disabled`, `size`, `variant`) — adjust names to match, not the other way round. `Button`'s default variant is the primary gradient; pass `variant="secondary"` if the design checklist flags a second gradient on screen (the entry button is the screen's one gradient action; inside the sheet the near-black primary is right — use whatever variant renders near-black primary in the current `Button`).

- [ ] **Step 2: `AgentSheet`**

```tsx
// components/agent/AgentSheet.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowUp, DotsThree, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAgent } from '@/hooks/useAgent';
import { useLimitPaywall } from '@/hooks/useLimitPaywall';
import { ProposalCard } from '@/components/agent/ProposalCard';
import { SupernovaStar } from '@/components/ui/SupernovaStar';
import { agentSuggestions, quotaLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';
import type { AgentOp } from '@/types/agent';

export function AgentSheet({ visible, trip, onClose }: { visible: boolean; trip: TripWithDays; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useAgent({ surface: 'trip', trip, enabled: visible });
  const openPaywall = useLimitPaywall();
  const [text, setText] = useState('');
  const [applying, setApplying] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [agent.messages.length]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 10_000); return () => clearTimeout(t); }, [undo]);

  const send = useCallback(async (value?: string) => {
    const msg = (value ?? text).trim();
    if (!msg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setText('');
    const r = await agent.send(msg);
    if (r === 'limit') openPaywall();
  }, [text, agent, openPaywall]);

  const confirmDrops = useCallback((warning: string) => new Promise<boolean>((resolve) => {
    Alert.alert('Remove days with stops?', warning, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Apply', style: 'destructive', onPress: () => resolve(true) },
    ]);
  }), []);

  const apply = useCallback(async (messageId: string, ops: AgentOp[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setApplying(messageId);
    try {
      const r = await agent.apply(messageId, ops, confirmDrops);
      if (r.applied) {
        const label = r.skipped ? `Changed ${r.applied} · ${r.skipped} no longer fit` : `Changed ${r.applied} thing${r.applied === 1 ? '' : 's'}`;
        setUndo(r.undo ? { label, run: r.undo } : { label, run: async () => {} });
      }
    } finally {
      setApplying(null);
    }
  }, [agent, confirmDrops]);

  const menu = useCallback(() => {
    Alert.alert('Conversation', undefined, [
      { text: 'Clear conversation', style: 'destructive', onPress: () => agent.clear() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [agent]);

  const q = agent.quota ? quotaLine(agent.quota) : null;
  const empty = !agent.loading && agent.messages.length === 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{trip.title.toUpperCase()}</Text>
            <Text style={[styles.title, { color: colors.text.primary }]}>Ask Supernova</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={menu} style={styles.iconButton} accessibilityLabel="Conversation options"><DotsThree size={24} color={colors.text.secondary} weight="bold" /></TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconButton} accessibilityLabel="Close"><X size={22} color={colors.text.secondary} weight="bold" /></TouchableOpacity>
          </View>
        </View>

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {agent.loading && <ActivityIndicator color={colors.text.tertiary} />}
          {empty && (
            <View style={styles.empty}>
              <SupernovaStar size={40} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Plan with Supernova</Text>
              <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>Ask for changes — nothing happens until you accept.</Text>
              {agentSuggestions(trip).map((s) => (
                <TouchableOpacity key={s} onPress={() => send(s)} style={[styles.chip, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]} accessibilityRole="button">
                  <Text style={{ color: colors.text.primary }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {agent.messages.map((m) => (
            <View key={m.id} style={m.role === 'user' ? styles.mine : styles.theirs}>
              <View style={[styles.bubble, m.role === 'user' ? { backgroundColor: colors.text.primary } : { backgroundColor: colors.background.card }]}>
                <Text style={{ color: m.role === 'user' ? colors.background.primary : colors.text.primary, fontSize: 15, lineHeight: 22 }}>{m.text}</Text>
              </View>
              {m.role === 'assistant' && m.operations.length > 0 && (
                <ProposalCard message={m} trip={trip} busy={applying === m.id} onApply={(ops) => apply(m.id, ops)} onDismiss={() => agent.dismiss(m.id)} />
              )}
            </View>
          ))}
          {agent.sending && <Text style={[styles.typing, { color: colors.text.tertiary }]}>Supernova is thinking…</Text>}
          {agent.error && <Text style={[styles.typing, { color: colors.status?.error ?? colors.text.secondary }]}>{agent.error}</Text>}
        </ScrollView>

        {undo && (
          <View style={[styles.undo, { backgroundColor: colors.text.primary }]}>
            <Text style={{ color: colors.background.primary, flex: 1 }}>{undo.label}</Text>
            <TouchableOpacity onPress={async () => { await undo.run(); setUndo(null); }} style={styles.iconButton} accessibilityRole="button">
              <Text style={{ color: colors.background.primary, fontWeight: '600' }}>Undo</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.background.cardBorder }]}>
          {q && <Text style={[styles.quota, { color: colors.text.tertiary }]}>{q}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              value={text} onChangeText={setText} placeholder="Ask for a change" placeholderTextColor={colors.text.tertiary}
              style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.card }]} maxLength={500} multiline
              onSubmitEditing={() => send()} returnKeyType="send" blurOnSubmit
            />
            <TouchableOpacity onPress={() => send()} disabled={!text.trim() || agent.sending} style={[styles.send, { backgroundColor: text.trim() ? colors.text.primary : colors.background.card }]} accessibilityLabel="Send">
              <ArrowUp size={20} color={text.trim() ? colors.background.primary : colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerButtons: { flexDirection: 'row' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  title: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '500' },
  emptyBody: { fontSize: 15, textAlign: 'center', marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', alignSelf: 'stretch', alignItems: 'center' },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'stretch' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '88%' },
  typing: { fontSize: 13 },
  undo: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, borderRadius: 12, paddingLeft: 16 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, gap: 6 },
  quota: { fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
```

Find the existing star component (`grep -rln "SupernovaStar\|BrandStar" components`) and use its real name and props; if none exists as a component, use the one `app/(tabs)/create.tsx` renders for its header star. Use the real colour token names from `constants/colors.ts` (`colors.background.primary` / `colors.status.error` may be named differently) — read before writing. When the undo bar has no undo (`run` empty) show only the label.

- [ ] **Step 3: Trip page entry**

In `app/trip/[id].tsx`:
- import `AgentSheet` and `useAiConsentGate`;
- `const [agentOpen, setAgentOpen] = useState(false);` and `const { requireConsent, consentSheet } = useAiConsentGate();` (if the screen already uses the gate, reuse it);
- `const openAgent = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); requireConsent('agent', () => setAgentOpen(true)); }, [requireConsent]);`
- next to the existing trip actions (where `ShareTripSheet` is opened), when `canEditItinerary`, render one button: the brand-gradient pill with the star icon and the label "Ask Supernova", `accessibilityLabel="Ask Supernova"`, min height 44 — the screen's single gradient action (if another gradient CTA exists on this screen, make that one secondary);
- render `{trip && <AgentSheet visible={agentOpen} trip={trip} onClose={() => setAgentOpen(false)} />}` and `{consentSheet}` once.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "agent|trip/\[id\]"` → no errors. `npx jest` → all pass. `npm run lint` → no new errors in these files.

Run the design pre-ship checklist (`.claude/skills/supernova-design/SKILL.md`) and write the result into the commit body.

- [ ] **Step 5: Commit**

```bash
git add components/agent app/trip/\[id\].tsx
git commit -m "feat(agent): Ask Supernova sheet, proposal card and the trip page entry"
```

---

### Task 11: Evaluation script (decides model and thinking) — and a measured run

**Files:**
- Create: `scripts/agent-eval.mjs`

**Interfaces:**
- Consumes: compiled `functions/lib/agentTripContext.js`, `agentTripOps.js`, `agentModel.js`, `agentPrompt.js` (run `cd functions && npm run build` first); Admin SDK with `~/.config/supernova/service-account.json`; `GEMINI_API_KEY` from `functions/.env`.
- Produces: a printed table — per model: valid-proposal rate, average input/output tokens, average latency, estimated cost per message. **Never writes to Firestore.**

- [ ] **Step 1: Write the script**

```js
// scripts/agent-eval.mjs
// Usage: cd functions && npm run build && cd .. && node scripts/agent-eval.mjs [--trip TRIP_ID] [--models gemini-2.5-flash,gemini-2.5-flash-lite]
// Reads one editorial trip (default: the first editorial trip with 2+ cities), sends REQUESTS through the
// real context + prompt + validator, and prints quality, tokens, latency and cost. Read-only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { buildTripContext } = require('../functions/lib/agentTripContext.js');
const { validateTripOps } = require('../functions/lib/agentTripOps.js');
const { generate } = require('../functions/lib/agentModel.js');
const { TRIP_SYSTEM_PROMPT, AGENT_RESPONSE_SCHEMA } = require('../functions/lib/agentPrompt.js');

const PRICES = { // USD per 1M tokens (input, output) — check current Gemini pricing before trusting totals
  'gemini-2.5-flash': [0.30, 2.50],
  'gemini-2.5-flash-lite': [0.10, 0.40],
};
const REQUESTS = [
  'Make day 2 less rushed', 'Find a great dinner near our hotel on the first night', 'Add a night in the last city',
  'Move the museum to the morning', 'We land at 4pm on day 1, fix that day', 'Add a rooftop bar on day 3',
  'Swap the aquarium for something outdoors', 'Is day 3 too packed?', 'What should we not miss here?',
  'Put a coffee stop before the first sight each day', 'Remove anything touristy on day 4', 'Start the trip two days later',
  'Add a day trip to the coast', 'We want a slow morning on the last day', 'Order day 1 so we walk less',
  'Add lunch on every day that has none', 'Swap the order of the two cities', 'Set dinner at 20:00 on day 2',
  'Add a famous viewpoint for sunset', 'Which day is best for the market?', 'Drop the last city',
  'Make it kid friendly', 'Add a cooking class', 'We hate museums', 'Plan nothing after 6pm on day 2',
];

const env = Object.fromEntries(fs.readFileSync('functions/.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const apiKey = env.GEMINI_API_KEY;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const models = (arg('--models') ?? 'gemini-2.5-flash,gemini-2.5-flash-lite').split(',');

async function loadTrip() {
  let doc;
  if (arg('--trip')) doc = await db.doc(`trips/${arg('--trip')}`).get();
  else {
    const q = await db.collection('trips').where('isEditorial', '==', true).limit(40).get();
    doc = q.docs.find((d) => (d.get('additionalDestinations') ?? []).length > 0) ?? q.docs[0];
  }
  const t = doc.data();
  const days = await doc.ref.collection('days').get();
  const ctxDays = await Promise.all(days.docs.map(async (d) => ({
    id: d.id, dayNumber: d.get('dayNumber'), city: d.get('destinationIndex') ?? 0,
    stops: (await d.ref.collection('activities').get()).docs.map((a) => ({ id: a.id, title: a.get('title'), type: a.get('type'), startTime: a.get('startTime') ?? null, placed: a.get('lat') != null, order: a.get('order') ?? 0 })),
  })));
  const cities = [t.destination, ...(t.additionalDestinations ?? [])].map((c) => ({ name: c.name, nights: c.nights ?? null }));
  return buildTripContext({ title: t.title, startDay: '2026-11-02', today: new Date().toISOString().slice(0, 10), cities, days: ctxDays, bookings: [], topPlaces: [] });
}

const { text, labels } = await loadTrip();
console.log(`context: ${text.length} chars`);
for (const model of models) {
  let valid = 0, inT = 0, outT = 0, lat = 0, failed = 0, opsTotal = 0, droppedTotal = 0;
  for (const r of REQUESTS) {
    try {
      const res = await generate({ system: TRIP_SYSTEM_PROMPT, turns: [{ role: 'user', text: `${text}\n\nREQUEST: ${r}` }], schema: AGENT_RESPONSE_SCHEMA, apiKey, model });
      const v = validateTripOps(res.json.operations, labels);
      if (v.dropped === 0) valid += 1;
      opsTotal += v.ops.length; droppedTotal += v.dropped;
      inT += res.inputTokens; outT += res.outputTokens; lat += res.latencyMs;
    } catch (e) { failed += 1; console.error(model, r, String(e).slice(0, 120)); }
  }
  const ok = REQUESTS.length - failed;
  const [pi, po] = PRICES[model] ?? [0, 0];
  const cost = ok ? ((inT / ok) * pi + (outT / ok) * po) / 1e6 : 0;
  console.log(`${model}: answered ${ok}/${REQUESTS.length}, fully valid ${valid}/${ok}, ops ${opsTotal} (dropped ${droppedTotal}), avg in ${Math.round(inT / ok)} out ${Math.round(outT / ok)} tok, avg ${Math.round(lat / ok)} ms, ~$${cost.toFixed(5)}/message`);
}
process.exit(0);
```

- [ ] **Step 2: Run it** (costs a few cents; Gemini key from `functions/.env`)

Run: `cd functions && npm run build && cd .. && node scripts/agent-eval.mjs`
Expected: two summary lines (flash, flash-lite), each answering ≥ 24/25 with fully valid ≥ 20/25.

- [ ] **Step 3: Decide and record**

If flash-lite's fully-valid count is within 2 of flash's, set `AGENT_MODEL = 'gemini-2.5-flash-lite'` in `functions/src/agentModel.ts` and update the Task 4 test expectation; otherwise keep flash. Record the numbers and the decision in the ledger as a ruling and in the commit body.

- [ ] **Step 4: Commit**

```bash
git add scripts/agent-eval.mjs functions/src/agentModel.ts __tests__/functions/agentModel.test.ts
git commit -m "feat(agent): evaluation script; model chosen on measured quality and cost"
```

---

### Task 12: Docs, privacy text, full verification

**Files:**
- Modify: `CLAUDE.md` (Cloud Functions list: an **Ask Supernova** bullet; Hooks table: `useAgent`; Firestore collections: `users/{uid}/agentThreads`)
- Modify: `hosting/privacy.html` (AI section: the agent and what it sends)
- Modify: `docs/superpowers/specs/2026-10-14-trip-agent-design.md` (two lines under "App: applying a proposal": (1) Undo covers stop and date changes; route changes are confirmed and not undoable — a route save deletes days and their stops; (2) "removes N stops" is shown in the confirmation at Apply, not on the card line — computing it needs the new route, which can need a city lookup)

- [ ] **Step 1: CLAUDE.md** — add under Cloud Functions:

```markdown
- **Ask Supernova** (spec `docs/superpowers/specs/2026-10-14-trip-agent-design.md`; pure `agentTripContext.ts`, `agentTripOps.ts`, `agentSurfaces.ts`, `agentModel.ts`, `agentPrompt.ts`; wiring `agentFunctions.ts`) — callable `agent` `{ surface, subjectId, message, requestId, capabilities }`: one Gemini call (thinking off, JSON schema) per message proposes namespaced operations (`trip.*`), validated and filtered to the app's declared `capabilities` (`AGENT_CAPABILITIES` in `services/agent.ts` — **an app only receives operations it declared, so shipped apps survive new ones**). It never edits the trip: the app applies accepted operations through `useCreateTrip` / `useTripRoute` (`utils/agentApply.ts`, `hooks/useAgent.ts`). One monthly allowance for every surface (10 free / 300 Pro, `agentQuotaPolicy`), ≤ 20/hour, one at a time; threads `users/{uid}/agentThreads/{surface}_{id}/messages` (owner read; server writes; owner may set `status`). `onTripDeletedAgentThreads` removes a deleted trip's threads (collection-group `messages.agentThread`). Measure model changes with `node scripts/agent-eval.mjs`. **A new surface** adds a context builder + validator on the server, an `OP_CAPABILITY` entry, and an adapter in the app.
```

and a `useAgent` row in the Hooks table: `useAgent({ surface, trip, enabled })` | `{ messages, sending, quota, send, apply, dismiss, clear }` — Ask Supernova on a trip.

- [ ] **Step 2: Privacy policy** — in `hosting/privacy.html`'s AI section add: "Ask Supernova: when you ask for changes to a trip, we send that trip's cities, days and stops, your message and recent messages in that conversation, and the name, date and time of the trip's bookings to Google's Gemini API. We never send confirmation codes, addresses or boarding-pass barcodes. Your conversation is stored privately in your account and deleted with the trip or your account." (Deploy hosting with the release, not now.)

- [ ] **Step 3: Full verification**

Run: `npx jest` → all suites pass. `npx tsc --noEmit -p .` → no new errors versus `main`. `cd functions && npm run build` → exit 0. `npm run lint` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md hosting/privacy.html docs/superpowers/specs/2026-10-14-trip-agent-design.md
git commit -m "docs: Ask Supernova in CLAUDE.md, privacy policy text, undo ruling in the spec"
```

**Release (after the final review, with the owner's go-ahead — not part of execution):** deploy `firebase deploy --only functions:agent,functions:getAgentQuota,functions:onTripDeletedAgentThreads,firestore:rules,firestore:indexes`, then hosting for the privacy page, then an app build (the consent bump and the sheet ship together; older apps keep working because the server never sends them operations).
