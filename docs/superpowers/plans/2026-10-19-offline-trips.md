# Offline Trips and Boarding Passes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trips (days, stops, bookings, packing) and the wallet (boarding passes with barcode, reservations) open and read correctly with no signal, including a cold start, and the app never looks signed out offline.

**Architecture:** Persist an allow-listed slice of the TanStack Query cache to AsyncStorage per uid (`@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`), reviving Firestore Timestamps on restore. NetInfo drives TanStack's `onlineManager` so queries pause offline instead of failing. A session snapshot lets the auth listener route a signed-in user to the tabs when the profile read fails offline. Writes are refused offline at the UI entry points.

**Tech Stack:** Expo SDK 54, React Native, TanStack Query 5.100.5, Firebase JS SDK (web build), AsyncStorage, `@react-native-community/netinfo`, Jest (pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-10-19-offline-trips-design.md`

## Global Constraints

- View only offline; no queued edits.
- Persist only: `['trips', uid]`, `['myTrips', uid]`, `['trip', tripId]`, `['tripBookings', tripId, uid]`, `['packingItems', tripId]`, `['boardingPasses', uid]`, `['reservations', uid]`, `['sharedTripBookings', uid, *]`; only `status === 'success'`.
- At most 40 trips' detail entries (`trip`, `tripBookings`, `packingItems`): in progress, then upcoming soonest first, then past most recent first.
- Prefetch only trips whose saved copy is missing or older than 12 h; one at a time.
- Cache expires after 30 days; buster = `offline-v1:{uid}`; wiped on sign-out / account deletion / different uid.
- Offline strip copy: "You're offline · Showing your saved trips". Blocked-action copy: "You're offline — try again when you're connected".
- Design rules (CLAUDE.md): theme tokens via `useTheme()`, no emoji, house spring tension 65 / friction 11, empty states = icon + title + description (+ action where one exists), sentence case, `useCallback` handlers, `@/` imports.
- Pinned dependency versions: `@tanstack/react-query-persist-client@5.100.5`, `@tanstack/query-async-storage-persister@5.100.5` (must equal the installed `@tanstack/react-query` 5.100.5); NetInfo via `npx expo install @react-native-community/netinfo`.
- No onSnapshot listeners (Architecture Rule 2). New native module ⇒ ships in 1.0.8 only.

## Review Focus

1. A Timestamp nested inside an array of days/activities (e.g. `days[0].date`) must revive — tested in Task 1 (`reviveTimestamps` nested-array case).
2. A plain object that merely has `seconds`/`nanoseconds` but no `type` marker must NOT be turned into a Timestamp — tested in Task 1.
3. Trips with `startDate: null` (Dates TBD) must not crash the trip-set ordering and sort after dated upcoming trips — tested in Task 1 (`offlineTripSet` null-dates case).
4. Account switch on one phone: B signing in after A must never see A's cache — tested in Task 1 (`cacheBelongsTo`) and enforced by the buster in Task 4.
5. Online but the profile read fails (server error): must keep today's behaviour (welcome), not the offline path — tested in Task 2 (`canUseSnapshot` truth table).

---

### Task 1: Pure offline-cache rules

**Files:**
- Create: `utils/offlineCache.ts`
- Test: `__tests__/utils/offlineCache.test.ts`

**Interfaces:**
- Produces:
  - `PERSISTED_ROOTS: readonly string[]`
  - `shouldPersistQuery(queryKey: readonly unknown[], status: string, allowedTripIds: ReadonlySet<string>): boolean`
  - `reviveTimestamps<T>(value: T): T`
  - `offlineTripSet(trips: { id: string; startDate: Timestamp | null; endDate: Timestamp | null }[], now: Date, cap?: number): string[]`
  - `needsPrefetch(dataUpdatedAt: number | undefined, now: number): boolean`
  - `cacheBuster(uid: string): string` and `cacheBelongsTo(buster: string | undefined, uid: string): boolean`
  - `OFFLINE_MAX_AGE_MS: number`, `PREFETCH_FRESH_MS: number`, `OFFLINE_TRIP_CAP: number`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/offlineCache.test.ts
import { Timestamp } from 'firebase/firestore';
import {
  shouldPersistQuery, reviveTimestamps, offlineTripSet, needsPrefetch,
  cacheBuster, cacheBelongsTo, OFFLINE_TRIP_CAP,
} from '@/utils/offlineCache';

const allowed = new Set(['t1']);

describe('shouldPersistQuery', () => {
  it('keeps the wallet and trip lists for the signed-in user', () => {
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['reservations', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['trips', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['myTrips', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['sharedTripBookings', 'u1', 't1,t2'], 'success', allowed)).toBe(true);
  });
  it('keeps trip details only for trips in the offline set', () => {
    expect(shouldPersistQuery(['trip', 't1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['tripBookings', 't1', 'u1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['packingItems', 't1'], 'success', allowed)).toBe(true);
    expect(shouldPersistQuery(['trip', 't9'], 'success', allowed)).toBe(false);
  });
  it('drops other people\'s trip lists, feeds and failed queries', () => {
    expect(shouldPersistQuery(['trips', 'u1', 'public'], 'success', allowed)).toBe(false);
    expect(shouldPersistQuery(['feed', 'forYou'], 'success', allowed)).toBe(false);
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'error', allowed)).toBe(false);
    expect(shouldPersistQuery(['boardingPasses', 'u1'], 'pending', allowed)).toBe(false);
  });
});

describe('reviveTimestamps', () => {
  it('turns serialised timestamps back into Timestamps, nested in arrays and objects', () => {
    const t = Timestamp.fromMillis(1_760_000_000_000);
    const round = JSON.parse(JSON.stringify({ startDate: t, days: [{ date: t, n: 1 }] }));
    const out = reviveTimestamps(round);
    expect(out.startDate).toBeInstanceOf(Timestamp);
    expect(out.startDate.toMillis()).toBe(1_760_000_000_000);
    expect(out.days[0].date).toBeInstanceOf(Timestamp);
    expect(out.days[0].n).toBe(1);
  });
  it('leaves look-alike objects without the type marker alone', () => {
    const v = { seconds: 5, nanoseconds: 0 };
    expect(reviveTimestamps(v)).toEqual({ seconds: 5, nanoseconds: 0 });
    expect(reviveTimestamps(v)).not.toBeInstanceOf(Timestamp);
  });
  it('passes primitives and null through', () => {
    expect(reviveTimestamps(null)).toBeNull();
    expect(reviveTimestamps('x')).toBe('x');
    expect(reviveTimestamps(3)).toBe(3);
  });
});

describe('offlineTripSet', () => {
  const d = (iso: string) => Timestamp.fromDate(new Date(iso));
  const now = new Date('2026-10-19T12:00:00Z');
  it('orders in progress, then upcoming soonest, then past most recent', () => {
    const ids = offlineTripSet([
      { id: 'past-old', startDate: d('2026-01-01'), endDate: d('2026-01-05') },
      { id: 'later', startDate: d('2026-12-01'), endDate: d('2026-12-05') },
      { id: 'live', startDate: d('2026-10-18'), endDate: d('2026-10-22') },
      { id: 'soon', startDate: d('2026-11-01'), endDate: d('2026-11-03') },
      { id: 'past-new', startDate: d('2026-09-01'), endDate: d('2026-09-05') },
    ], now);
    expect(ids).toEqual(['live', 'soon', 'later', 'past-new', 'past-old']);
  });
  it('puts trips with no dates after dated upcoming trips and before past ones', () => {
    const ids = offlineTripSet([
      { id: 'past', startDate: d('2026-09-01'), endDate: d('2026-09-05') },
      { id: 'tbd', startDate: null, endDate: null },
      { id: 'soon', startDate: d('2026-11-01'), endDate: d('2026-11-03') },
    ], now);
    expect(ids).toEqual(['soon', 'tbd', 'past']);
  });
  it('caps the set', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, startDate: null, endDate: null }));
    expect(offlineTripSet(many, now)).toHaveLength(OFFLINE_TRIP_CAP);
    expect(offlineTripSet(many, now, 3)).toHaveLength(3);
  });
});

describe('needsPrefetch', () => {
  const now = 1_000_000_000_000;
  it('fetches missing or older than 12 hours, skips fresh', () => {
    expect(needsPrefetch(undefined, now)).toBe(true);
    expect(needsPrefetch(now - 13 * 3600_000, now)).toBe(true);
    expect(needsPrefetch(now - 60_000, now)).toBe(false);
  });
});

describe('cacheBelongsTo', () => {
  it('matches only the same uid', () => {
    expect(cacheBelongsTo(cacheBuster('a'), 'a')).toBe(true);
    expect(cacheBelongsTo(cacheBuster('a'), 'b')).toBe(false);
    expect(cacheBelongsTo(undefined, 'a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/utils/offlineCache.test.ts`
Expected: FAIL — `Cannot find module '@/utils/offlineCache'`

- [ ] **Step 3: Implement**

```ts
// utils/offlineCache.ts
/**
 * Offline trips and wallet (spec docs/superpowers/specs/2026-10-19-offline-trips-design.md): which cached
 * queries are kept on the phone, how their Firestore Timestamps come back from JSON, which trips are worth
 * keeping, and when a saved copy is stale. Pure.
 */
import { Timestamp } from 'firebase/firestore';

export const OFFLINE_MAX_AGE_MS = 30 * 24 * 3600_000;
export const PREFETCH_FRESH_MS = 12 * 3600_000;
export const OFFLINE_TRIP_CAP = 40;

/** Per-user lists (key length 2: [root, uid]) and trip details (filtered by the offline trip set). */
const USER_LISTS = new Set(['trips', 'myTrips', 'boardingPasses', 'reservations']);
const TRIP_DETAILS = new Set(['trip', 'tripBookings', 'packingItems']);
export const PERSISTED_ROOTS = [...USER_LISTS, ...TRIP_DETAILS, 'sharedTripBookings'] as const;

export function shouldPersistQuery(queryKey: readonly unknown[], status: string, allowedTripIds: ReadonlySet<string>): boolean {
  if (status !== 'success') return false;
  const [root, second] = queryKey;
  if (typeof root !== 'string') return false;
  // ['trips', uid, 'public'] is someone's profile tab, not the user's own list.
  if (USER_LISTS.has(root)) return queryKey.length === 2;
  if (root === 'sharedTripBookings') return true;
  if (TRIP_DETAILS.has(root)) return typeof second === 'string' && allowedTripIds.has(second);
  return false;
}

const TS_TYPE = 'firestore/timestamp/1.x';

/** Timestamp.toJSON() writes {seconds, nanoseconds, type}; only that exact marker is revived. */
export function reviveTimestamps<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => reviveTimestamps(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.type === TS_TYPE && typeof o.seconds === 'number' && typeof o.nanoseconds === 'number') {
      return new Timestamp(o.seconds, o.nanoseconds) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = reviveTimestamps(v);
    return out as T;
  }
  return value;
}

type DatedTrip = { id: string; startDate: Timestamp | null; endDate: Timestamp | null };

/** In progress → upcoming (soonest) → no dates → past (most recent), capped. */
export function offlineTripSet(trips: DatedTrip[], now: Date, cap = OFFLINE_TRIP_CAP): string[] {
  const t = now.getTime();
  const rank = (trip: DatedTrip): [number, number] => {
    const start = trip.startDate?.toMillis?.() ?? null;
    const end = trip.endDate?.toMillis?.() ?? start;
    if (start == null) return [2, 0];
    // A trip runs through the whole of its last day.
    if (start <= t && (end ?? start) + 24 * 3600_000 > t) return [0, start];
    if (start > t) return [1, start];
    return [3, -(end ?? start)];
  };
  return [...trips]
    .map((trip) => ({ id: trip.id, r: rank(trip) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1])
    .slice(0, cap)
    .map((x) => x.id);
}

export function needsPrefetch(dataUpdatedAt: number | undefined, now: number): boolean {
  return !dataUpdatedAt || now - dataUpdatedAt > PREFETCH_FRESH_MS;
}

export function cacheBuster(uid: string): string {
  return `offline-v1:${uid}`;
}

export function cacheBelongsTo(buster: string | undefined, uid: string): boolean {
  return buster === cacheBuster(uid);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/utils/offlineCache.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add utils/offlineCache.ts __tests__/utils/offlineCache.test.ts
git commit -m "feat(offline): rules for which trips and wallet data are kept on the phone"
```

---

### Task 2: Pure session snapshot

**Files:**
- Create: `utils/sessionSnapshot.ts`
- Test: `__tests__/utils/sessionSnapshot.test.ts`

**Interfaces:**
- Produces:
  - `type SessionSnapshot = { v: 1; uid: string; profile: Record<string, unknown>; tier: 'free' | 'pro' | 'business'; hasSeenOnboarding: boolean; aiConsentVersion: number | null; blockedUids: string[]; hiddenKeys: string[]; savedAt: number }`
  - `snapshotKey(uid: string): string`
  - `parseSnapshot(raw: string | null, uid: string): SessionSnapshot | null`
  - `canUseSnapshot(a: { readFailed: boolean; offline: boolean; snapshot: SessionSnapshot | null; uid: string }): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/sessionSnapshot.test.ts
import { canUseSnapshot, parseSnapshot, snapshotKey, type SessionSnapshot } from '@/utils/sessionSnapshot';

const snap: SessionSnapshot = {
  v: 1, uid: 'u1', profile: { uid: 'u1', fullName: 'Mark' }, tier: 'pro', hasSeenOnboarding: true,
  aiConsentVersion: 3, blockedUids: ['x'], hiddenKeys: ['post_1'], savedAt: 1,
};

describe('parseSnapshot', () => {
  it('round-trips a saved snapshot for the same uid', () => {
    expect(parseSnapshot(JSON.stringify(snap), 'u1')).toEqual(snap);
  });
  it('rejects another uid, bad JSON, a wrong version or nothing', () => {
    expect(parseSnapshot(JSON.stringify(snap), 'u2')).toBeNull();
    expect(parseSnapshot('{oops', 'u1')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...snap, v: 2 }), 'u1')).toBeNull();
    expect(parseSnapshot(null, 'u1')).toBeNull();
  });
  it('namespaces the storage key by uid', () => {
    expect(snapshotKey('u1')).toBe('sessionSnapshot:u1');
  });
});

describe('canUseSnapshot', () => {
  it('is used only when the read failed, the phone is offline and a snapshot for this uid exists', () => {
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: snap, uid: 'u1' })).toBe(true);
  });
  it('keeps today\'s behaviour otherwise', () => {
    expect(canUseSnapshot({ readFailed: true, offline: false, snapshot: snap, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: false, offline: true, snapshot: snap, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: null, uid: 'u1' })).toBe(false);
    expect(canUseSnapshot({ readFailed: true, offline: true, snapshot: snap, uid: 'u2' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest __tests__/utils/sessionSnapshot.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// utils/sessionSnapshot.ts
/**
 * What the app needs to open signed in without signal (offline spec §2): the profile, tier, onboarding and
 * consent state and the moderation lists, saved after each successful hydrateSession. Pure.
 */
export type SessionSnapshot = {
  v: 1;
  uid: string;
  profile: Record<string, unknown>;
  tier: 'free' | 'pro' | 'business';
  hasSeenOnboarding: boolean;
  aiConsentVersion: number | null;
  blockedUids: string[];
  hiddenKeys: string[];
  savedAt: number;
};

export function snapshotKey(uid: string): string {
  return `sessionSnapshot:${uid}`;
}

export function parseSnapshot(raw: string | null, uid: string): SessionSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionSnapshot;
    return s && s.v === 1 && s.uid === uid ? s : null;
  } catch {
    return null;
  }
}

export function canUseSnapshot(a: { readFailed: boolean; offline: boolean; snapshot: SessionSnapshot | null; uid: string }): boolean {
  return a.readFailed && a.offline && !!a.snapshot && a.snapshot.uid === a.uid;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest __tests__/utils/sessionSnapshot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/sessionSnapshot.ts __tests__/utils/sessionSnapshot.test.ts
git commit -m "feat(offline): session snapshot rules for opening the app without signal"
```

---

### Task 3: Online detection and the offline guard

**Files:**
- Modify: `package.json`, `package-lock.json` (dependencies)
- Create: `services/offline.ts`

**Interfaces:**
- Produces:
  - `startOnlineSync(): () => void` — wires NetInfo to `onlineManager`
  - `isOnline(): boolean`
  - `useIsOnline(): boolean`
  - `requireOnline(): boolean` — returns true when online; otherwise shows the offline alert (Light haptic) and returns false

- [ ] **Step 1: Install dependencies**

Run:
```bash
npx expo install @react-native-community/netinfo
npm install @tanstack/react-query-persist-client@5.100.5 @tanstack/query-async-storage-persister@5.100.5
```
Expected: both added to `package.json`; `npx tsc --noEmit -p .` still clean. If 5.100.5 of either persist package doesn't exist, use the newest 5.100.x and ledger the ruling — it must share `@tanstack/query-core` with the installed react-query (check `npm ls @tanstack/query-core` shows one version).

- [ ] **Step 2: Implement**

```ts
// services/offline.ts
/**
 * Connectivity for the offline trips feature (spec §3). NetInfo drives TanStack's onlineManager, so queries
 * pause offline and keep showing saved data instead of erroring, then refetch when signal returns.
 * Writes are refused offline (requireOnline): with Firestore's web build an offline write waits in memory
 * and is lost if the app closes.
 */
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

export function startOnlineSync(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable is null while unknown; treat unknown as online so a slow probe never blocks.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
  return () => onlineManager.setEventListener(() => undefined);
}

export function isOnline(): boolean {
  return onlineManager.isOnline();
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

export function requireOnline(): boolean {
  if (onlineManager.isOnline()) return true;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Alert.alert("You're offline", 'Try again when you\'re connected.');
  return false;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npx eslint services/offline.ts`
Expected: no errors. (No unit test: this file is wiring around NetInfo and onlineManager; Ruling: covered by the device check in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json services/offline.ts
git commit -m "feat(offline): online detection drives the query layer; requireOnline guard"
```

---

### Task 4: Persist the allow-listed cache per account

**Files:**
- Create: `services/queryPersist.ts`
- Modify: `hooks/useMyTrips.ts`, `hooks/useTripList.ts` (read the trip set for the allow-list — no change needed if `queryClient.getQueryData` is used; see code)
- Modify: `app/_layout.tsx` (call `startOnlineSync()` once at module load; export `queryClient` usage stays)

**Interfaces:**
- Consumes: `shouldPersistQuery`, `reviveTimestamps`, `offlineTripSet`, `cacheBuster`, `OFFLINE_MAX_AGE_MS` (Task 1); `startOnlineSync` (Task 3)
- Produces:
  - `startPersistence(queryClient: QueryClient, uid: string): Promise<void>` — restores this uid's saved cache (resolves after restore), then keeps saving
  - `stopPersistence(queryClient: QueryClient, opts: { wipe: boolean }): Promise<void>`

- [ ] **Step 1: Implement `services/queryPersist.ts`**

```ts
// services/queryPersist.ts
/**
 * Keeps the offline slice of the query cache on the phone, one account at a time (spec §1, §4). The buster
 * is per uid, so another account's saved copy is discarded on restore; sign-out wipes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Timestamp } from 'firebase/firestore';
import { cacheBuster, offlineTripSet, OFFLINE_MAX_AGE_MS, reviveTimestamps, shouldPersistQuery } from '@/utils/offlineCache';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'offline-query-cache',
  throttleTime: 2000,
  serialize: (data) => JSON.stringify(data),
  deserialize: (raw) => reviveTimestamps(JSON.parse(raw)),
});

let unsubscribe: (() => void) | null = null;

type DatedTrip = { id: string; startDate: Timestamp | null; endDate: Timestamp | null };

/** The user's own + joined trips, from whichever list is loaded. */
export function knownTrips(queryClient: QueryClient, uid: string): DatedTrip[] {
  const mine = (queryClient.getQueryData<DatedTrip[]>(['myTrips', uid]) ?? []);
  const own = (queryClient.getQueryData<DatedTrip[]>(['trips', uid]) ?? []);
  const byId = new Map<string, DatedTrip>();
  for (const t of [...own, ...mine]) byId.set(t.id, t);
  return [...byId.values()];
}

export async function startPersistence(queryClient: QueryClient, uid: string): Promise<void> {
  unsubscribe?.();
  const [unsub, restored] = persistQueryClient({
    queryClient,
    persister,
    buster: cacheBuster(uid),
    maxAge: OFFLINE_MAX_AGE_MS,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => {
        const allowed = new Set(offlineTripSet(knownTrips(queryClient, uid), new Date()));
        return shouldPersistQuery(q.queryKey, q.state.status, allowed);
      },
    },
  });
  unsubscribe = unsub;
  await restored.catch((e) => console.warn('[offline] restore failed:', e));
}

export async function stopPersistence(queryClient: QueryClient, opts: { wipe: boolean }): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  if (opts.wipe) {
    queryClient.clear();
    await persister.removeClient().catch((e) => console.warn('[offline] wipe failed:', e));
  }
}
```

Note: `shouldDehydrateQuery` rebuilds the trip set per query; the lists are small (≤ a few hundred) and saving is throttled to 2 s, so this is cheap. If profiling shows otherwise, compute it once per save — Ruling if changed.

- [ ] **Step 2: Wire into `app/_layout.tsx`**

At module level (after `configureGoogleSignIn();`), add:

```ts
import { startOnlineSync } from '@/services/offline';
import { startPersistence, stopPersistence } from '@/services/queryPersist';
startOnlineSync();
```

In the `onAuthStateChanged` callback, before `hydrateSession` in the signed-in branch:

```ts
await startPersistence(queryClient, firebaseUser.uid);
```

In the signed-out branch (first line):

```ts
await stopPersistence(queryClient, { wipe: true });
```

Ruling recorded in code comment: sign-out and account deletion both end in this branch (`auth.signOut()`), so one wipe covers both (spec §4).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npx eslint services/queryPersist.ts app/_layout.tsx && npx jest --silent`
Expected: clean; suite green.

- [ ] **Step 4: Commit**

```bash
git add services/queryPersist.ts app/_layout.tsx
git commit -m "feat(offline): keep trips and wallet on the phone per account; wiped on sign-out"
```

---

### Task 5: Open signed in without signal

**Files:**
- Modify: `services/session.ts` (save snapshot after successful hydrate; export `restoreFromSnapshot`)
- Modify: `app/_layout.tsx` (offline fallback path; re-hydrate on reconnect)

**Interfaces:**
- Consumes: `SessionSnapshot`, `snapshotKey`, `parseSnapshot`, `canUseSnapshot` (Task 2); `isOnline` (Task 3)
- Produces:
  - `saveSessionSnapshot(uid: string, hasSeenOnboarding: boolean): Promise<void>` (in `services/session.ts`)
  - `restoreFromSnapshot(uid: string): Promise<{ hasSeenOnboarding: boolean } | null>` (returns null if no usable snapshot)

- [ ] **Step 1: Save the snapshot in `hydrateSession`**

In `services/session.ts`, add the import and function:

```ts
import { snapshotKey, parseSnapshot, type SessionSnapshot } from '@/utils/sessionSnapshot';
import { useModerationStore } from '@/stores/useModerationStore';

export async function saveSessionSnapshot(uid: string, hasSeenOnboarding: boolean): Promise<void> {
  const profile = useUserStore.getState().profile;
  if (!profile) return;
  const { blockedUids, hiddenKeys } = useModerationStore.getState();
  const snap: SessionSnapshot = {
    v: 1, uid, profile: profile as unknown as Record<string, unknown>,
    tier: useAuthStore.getState().serverTier ?? 'free',
    hasSeenOnboarding,
    aiConsentVersion: useAiConsentStore.getState().version ?? null,
    blockedUids, hiddenKeys, savedAt: Date.now(),
  };
  await AsyncStorage.setItem(snapshotKey(uid), JSON.stringify(snap)).catch((e) =>
    console.warn('[session] snapshot save failed:', e));
}

export async function restoreFromSnapshot(uid: string): Promise<{ hasSeenOnboarding: boolean } | null> {
  const snap = parseSnapshot(await AsyncStorage.getItem(snapshotKey(uid)).catch(() => null), uid);
  if (!snap) return null;
  useAuthStore.getState().setTier(snap.tier);
  useAuthStore.getState().setServerTier(snap.tier);
  useAiConsentStore.getState().setVersion(snap.aiConsentVersion);
  useUserStore.getState().setProfile(snap.profile as never);
  useModerationStore.getState().setAll({ blockedUids: snap.blockedUids, hiddenKeys: snap.hiddenKeys });
  return { hasSeenOnboarding: snap.hasSeenOnboarding };
}
```

Check the actual field names on `useAuthStore` (`serverTier`) and `useAiConsentStore` (`version`) before pasting; if they differ, use the real names and ledger it. `loadModerationState` is fire-and-forget, so save the snapshot after it settles: change the `loadModerationState(firebaseUser.uid);` line to

```ts
loadModerationState(firebaseUser.uid).finally(() => {
  saveSessionSnapshot(firebaseUser.uid, resolveHasSeenOnboarding(data, false));
});
```

(The onboarding flag saved here ignores the legacy key on purpose — the snapshot is only for a later offline launch, by which time the migration has written `hasSeenOnboarding` to the doc.)

Remove the snapshot on sign-out: in `stopPersistence`'s caller in `_layout.tsx` (signed-out branch) the uid is gone, so instead clear all snapshot keys there:

```ts
const keys = (await AsyncStorage.getAllKeys().catch(() => [])).filter((k) => k.startsWith('sessionSnapshot:'));
if (keys.length) await AsyncStorage.multiRemove(keys).catch(() => undefined);
```

- [ ] **Step 2: Use it in the auth listener (`app/_layout.tsx`)**

Replace the signed-in branch body with:

```ts
await startPersistence(queryClient, firebaseUser.uid);
let routed = false;
try {
  const { hasProfile, hasSeenOnboarding } = await hydrateSession(firebaseUser);
  router.replace(resolveAuthRoute({ isAuthenticated: true, hasProfile, onboardingComplete: hasSeenOnboarding }));
  routed = true;
} catch (error) {
  // NetInfo's first event may not have arrived at cold start, so ask it directly.
  const offline = !(await NetInfo.fetch()).isConnected;
  const snap = canUseSnapshot({
    readFailed: true, offline, uid: firebaseUser.uid,
    snapshot: parseSnapshot(await AsyncStorage.getItem(snapshotKey(firebaseUser.uid)).catch(() => null), firebaseUser.uid),
  }) ? await restoreFromSnapshot(firebaseUser.uid) : null;
  if (!snap) throw error; // today's behaviour: the outer catch routes to welcome
  router.replace(resolveAuthRoute({ isAuthenticated: true, hasProfile: true, onboardingComplete: snap.hasSeenOnboarding }));
  routed = true;
  // Refresh tier, profile and moderation once signal returns, without re-routing.
  const off = onlineManager.subscribe((online) => {
    if (!online) return;
    off();
    hydrateSession(firebaseUser).catch((e) => console.warn('[auth] re-hydrate after reconnect failed:', e));
  });
}
```

Imports: `AsyncStorage`, `NetInfo` from `@react-native-community/netinfo`, `onlineManager` from `@tanstack/react-query`, `canUseSnapshot`, `parseSnapshot`, `snapshotKey` from `@/utils/sessionSnapshot`, `restoreFromSnapshot` from `@/services/session`. Remove `routed` if lint flags it unused.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npx eslint services/session.ts app/_layout.tsx && npx jest --silent`
Expected: clean; suite green (session tests still pass — `resolveHasSeenOnboarding` unchanged).

- [ ] **Step 4: Commit**

```bash
git add services/session.ts app/_layout.tsx
git commit -m "feat(offline): open signed in without signal from a saved session"
```

---

### Task 6: Prefetch the offline trip set while online

**Files:**
- Modify: `hooks/useTripBookings.ts` (export the queryFn as `fetchTripBookings(tripId, uid)`)
- Modify: `hooks/usePackingList.ts` (export `fetchPackingItems`)
- Create: `hooks/useOfflinePrefetch.ts`
- Modify: `app/(tabs)/_layout.tsx` (mount the hook once)

**Interfaces:**
- Consumes: `offlineTripSet`, `needsPrefetch` (Task 1); `knownTrips` (Task 4); `useIsOnline` (Task 3); `fetchTripWithDays` (`hooks/useTrip.ts`)
- Produces: `fetchTripBookings(tripId: string, uid: string): Promise<TripBooking[]>`; `useOfflinePrefetch(): void`

- [ ] **Step 1: Export the fetchers**

In `hooks/useTripBookings.ts`, move the `useTripBookings` queryFn body into:

```ts
export async function fetchTripBookings(tripId: string, uid: string): Promise<TripBooking[]> {
  const [passes, reservations, shared] = await Promise.all([
    getDocs(query(collection(db, 'boarding_passes'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
    getDocs(query(collection(db, 'reservations'), where('ownerUid', '==', uid), where('tripId', '==', tripId))),
    fetchSharedBookings(tripId),
  ]);
  const own: TripBooking[] = [
    ...passes.docs.map((d) => ({ kind: 'boarding_pass' as const, item: { id: d.id, ...d.data() } as BoardingPass })),
    ...reservations.docs.map((d) => ({ kind: 'reservation' as const, item: { id: d.id, ...d.data() } as Reservation })),
  ];
  return mergeTripBookings(own, shared, uid);
}
```

and make the hook's `queryFn: () => fetchTripBookings(tripId!, uid!)`. In `hooks/usePackingList.ts` change `async function fetchPackingItems` to `export async function fetchPackingItems`.

- [ ] **Step 2: Implement the hook**

```ts
// hooks/useOfflinePrefetch.ts
/**
 * While online, quietly loads the full details of the trips kept for offline use (spec §1): only those whose
 * saved copy is missing or older than 12 h, one at a time, so it costs little and never competes with the
 * screen the user is on.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMyTrips } from '@/hooks/useMyTrips';
import { useIsOnline } from '@/services/offline';
import { knownTrips } from '@/services/queryPersist';
import { fetchTripWithDays } from '@/hooks/useTrip';
import { fetchTripBookings } from '@/hooks/useTripBookings';
import { fetchPackingItems } from '@/hooks/usePackingList';
import { needsPrefetch, offlineTripSet } from '@/utils/offlineCache';

export function useOfflinePrefetch(): void {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const online = useIsOnline();
  const { trips } = useMyTrips(!!uid);
  const listKey = (trips ?? []).map((t) => t.id).join(',');

  useEffect(() => {
    if (!uid || !online || !listKey) return;
    let cancelled = false;
    (async () => {
      const ids = offlineTripSet(knownTrips(queryClient, uid), new Date());
      for (const id of ids) {
        if (cancelled) return;
        const state = queryClient.getQueryState(['trip', id]);
        if (!needsPrefetch(state?.dataUpdatedAt, Date.now())) continue;
        try {
          await queryClient.prefetchQuery({ queryKey: ['trip', id], queryFn: () => fetchTripWithDays(id) });
          await queryClient.prefetchQuery({ queryKey: ['tripBookings', id, uid], queryFn: () => fetchTripBookings(id, uid) });
          await queryClient.prefetchQuery({ queryKey: ['packingItems', id], queryFn: () => fetchPackingItems(id) });
        } catch (e) {
          console.warn('[offline] prefetch failed for', id, e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [uid, online, listKey, queryClient]);
}
```

Check `useMyTrips`'s return shape (`{ trips }` vs `data`) before pasting; adapt and ledger. Going offline mid-loop flips `online`, which re-runs the effect and sets `cancelled` on the old run.

- [ ] **Step 3: Mount it** — in `app/(tabs)/_layout.tsx`, call `useOfflinePrefetch();` once at the top of the layout component.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p . && npx eslint hooks/useOfflinePrefetch.ts hooks/useTripBookings.ts hooks/usePackingList.ts "app/(tabs)/_layout.tsx" && npx jest --silent`
Expected: clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add hooks/useOfflinePrefetch.ts hooks/useTripBookings.ts hooks/usePackingList.ts "app/(tabs)/_layout.tsx"
git commit -m "feat(offline): load your trips' details in the background while online"
```

---

### Task 7: Offline strip and empty states

**Files:**
- Create: `components/ui/OfflineBanner.tsx`, `components/ui/OfflineEmptyState.tsx`
- Modify: `app/_layout.tsx` (render `<OfflineBanner />` above `AppStack` inside the providers)
- Modify (empty state when offline and no data): `app/(tabs)/index.tsx` (feed), `app/(tabs)/explore.tsx`, `app/notifications.tsx`, the messages list screen (find with `grep -rln "useThreads\|DM\|messages" app --include=*.tsx | head`), `app/user/[uid].tsx`

**Interfaces:**
- Consumes: `useIsOnline` (Task 3)
- Produces: `<OfflineBanner />`; `<OfflineEmptyState title: string; description: string />`

- [ ] **Step 1: Implement the strip**

```tsx
// components/ui/OfflineBanner.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiSlash } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useIsOnline } from '@/services/offline';

/** "You're offline · Showing your saved trips" — springs in at the top while there is no signal. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const y = useRef(new Animated.Value(online ? -80 : 0)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: online ? -80 : 0, tension: 65, friction: 11, useNativeDriver: true }).start();
  }, [online, y]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityElementsHidden={online}
      style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: colors.text.primary, transform: [{ translateY: y }] }]}
    >
      <WifiSlash size={14} color={colors.background.primary} weight="bold" />
      <Text style={[styles.text, { color: colors.background.primary }]}>You&apos;re offline · Showing your saved trips</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 8 },
  text: { fontSize: 13, fontWeight: '500' },
});
```

- [ ] **Step 2: Implement the empty state**

```tsx
// components/ui/OfflineEmptyState.tsx
import React from 'react';
import { WifiSlash } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';

/** Shown where nothing was saved for offline use (feed, explore, profiles, messages). */
export function OfflineEmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyState icon={WifiSlash} title={title} description={description} />;
}
```

Check `EmptyState`'s props (`icon`, `title`, `description`, optional action) in `components/ui/EmptyState.tsx` and match them.

- [ ] **Step 3: Mount the strip** — in `app/_layout.tsx`, inside `QueryClientProvider`, after `<AppStack />`: `<OfflineBanner />`.

- [ ] **Step 4: Offline empty states.** In each listed screen, next to its main query, add:

```tsx
const online = useIsOnline();
// …before the loading/skeleton return:
if (!online && !data) return <OfflineEmptyState title="Connect to see the feed" description="Your trips and wallet still work offline." />;
```

Titles: feed "Connect to see the feed"; explore "Connect to explore"; notifications "Connect to see notifications"; messages "Connect to see your messages"; profile "Connect to see this profile". Use the screen's actual data variable name in place of `data`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p . && npm run lint -- --quiet && npx jest --silent`
Expected: clean; suite green. Pre-ship checklist (supernova-design skill) run and reported for the two components.

- [ ] **Step 6: Commit**

```bash
git add components/ui/OfflineBanner.tsx components/ui/OfflineEmptyState.tsx app
git commit -m "feat(offline): offline strip and empty states for screens that need signal"
```

---

### Task 8: View only offline

**Files (add `if (!requireOnline()) return;` as the first statement of each handler):**
- `app/trip/[id].tsx`: `handleMore`, `handleOpenAddActivity`, `handleOpenEditActivity`, `handleSubmitActivityForm`, `handleDeleteActivity`, `handleMoveActivity`, `handleReorderActivities`, `handleOpenAddStop`, `handleDeleteDay`, `handleAddDay`, `handleToggleVisited`, `openNova` (inside, before `requireAiConsent`), and the Edit-trip button's onPress handler
- `app/trip/[id].tsx`: gate the background grounding pass and cover resolve on `online` (add `const online = useIsOnline();` and `&& online` to the pass's start condition and the `resolveCover` effect's guard), and `handleGroundActivity` returns early when `!isOnline()` (silently — no alert)
- `hooks/usePackingList.ts`: the add / toggle / delete functions
- `app/(wallet)/boarding-pass/add.tsx`, `app/(wallet)/loyalty/add.tsx` and the reservation add screen: their save handlers
- `app/(wallet)/boarding-pass/[id].tsx`, `app/(wallet)/reservation/[id].tsx`, `app/(wallet)/loyalty/[id].tsx`: delete and edit handlers; trip link/unlink handlers (`useBookingTripLink` callers)
- `hooks/useFollow.ts`: `follow`, `unfollow`
- Post create, comment send, DM send: the submit handlers in `app/post/create*.tsx`, the comment composer in `app/post/[id].tsx`, the DM composer (find with `grep -rn "sendMessage\|addDoc(collection(db, 'dmThreads'" app components hooks`)

- [ ] **Step 1: Add the guard to every handler above** (import `{ requireOnline, isOnline, useIsOnline }` from `@/services/offline`).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p . && npm run lint -- --quiet && npx jest --silent`
Expected: clean; suite green.

- [ ] **Step 3: Commit**

```bash
git add app hooks components
git commit -m "feat(offline): edits say you're offline instead of being lost"
```

---

### Task 9: Privacy text, docs, and the device check list

**Files:**
- Modify: `hosting/privacy.html` (one sentence), `CLAUDE.md` (Architecture: offline section + new files), `app.json` (version 1.0.8)

- [ ] **Step 1: Privacy policy** — in the "How we store your information" (or nearest storage) section add: "Your trips and wallet items are also kept on your device so you can see them without a connection; they're removed when you sign out." Update the effective date to the deploy date. Do not deploy Hosting without the owner's OK (it publishes).

- [ ] **Step 2: CLAUDE.md** — add an "Offline" bullet under Services: the allow-list, per-uid buster, wipe on sign-out, session snapshot, `requireOnline`, prefetch rules, and "a new persisted query key must be added to `utils/offlineCache.ts` deliberately (wallet barcodes are in the cache)".

- [ ] **Step 3: Version** — `app.json` `expo.version` → `1.0.8`.

- [ ] **Step 4: Verify and commit**

Run: `npx jest --silent && npx tsc --noEmit -p .`
Expected: suite green, clean.

```bash
git add hosting/privacy.html CLAUDE.md app.json
git commit -m "docs(offline): privacy line, architecture notes; version 1.0.8"
```

Device check (owner, on the 1.0.8 TestFlight build): airplane mode → force-quit → open → tabs (not welcome) with the offline strip; trips list; a trip's days and stops; a boarding pass with a scannable QR; a reservation; Edit / Ask Nova / add stop → "You're offline"; feed shows "Connect to see the feed"; signal on → strip leaves, data refreshes. Sign out → airplane mode → open → welcome, nothing of the previous account.
