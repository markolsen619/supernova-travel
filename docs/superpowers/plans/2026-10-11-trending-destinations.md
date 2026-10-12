# Trending Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The globe's heat reacts to what people are planning now — anonymous per-city counts of new trips, refreshed every 15 minutes.

**Architecture:** Pure rules in `functions/src/trending.ts`. A trip trigger increments `trendCounts/{slug}.days.{YYYY-MM-DD}`; a 15-minute job turns the last 14 days into heat and rebuilds `aggregates/heatmap` from baseline + trending + the daily job's saved community points (`serverState/heatCommunity`). The app re-reads the heat every 10 minutes.

**Tech Stack:** Firebase Functions v2 (onDocumentWritten, onSchedule), firebase-admin, Jest (pure tests under `__tests__/functions/`).

**Spec:** `docs/superpowers/specs/2026-10-11-trending-destinations-design.md`

## Global Constraints

- Every non-editorial trip counts, any visibility; only cities a write **adds** count; nothing is subtracted.
- Window **14** days (UTC days); a city under **3** contributes nothing; `trendWeight(n) = round(12 · log2(1 + n))`.
- `trendCounts` and `serverState` have **no client access**; clients only read the combined `aggregates/heatmap`.
- Refresh every 15 min; write `aggregates/heatmap` only when its points changed.
- `useHeatmap` staleTime 10 min.
- Privacy policy sentence: "We count, anonymously, which destinations people are planning, to show what's trending. No one can see who is planning a trip or where their trip goes."
- Deploy only the functions this changes; rules deploy for the explicit denies.

## Review Focus

1. **The trigger fires on every trip write** (budgets, reorders, visited ticks) → must do nothing (no catalog read, no write) unless a destination point changed. Test: `trendNewSlugs` returns `[]` for identical points; trigger early-returns on `sameDestinationPoints`. Task 1 + 2.
2. **A trip with no grounded destination** (manual trip, name only, null lat/lng) → counts nowhere, no crash. Test in Task 1 (`trendNewSlugs` with null points).
3. **Clock skew / future days** (a day key ahead of now) → not counted in the window. Test in Task 1 (`trendTotal` ignores future).
4. **An empty `trendCounts`** (first deploy, before backfill) → heat = baseline + community exactly as today. Test in Task 1 (`composeHeat` with no trending).
5. **Editorial seed runs** → never move the trend. Trigger checks `isEditorialTrip` on the after-doc (Task 2); backfill skips them (Task 3).

---

### Task 1: Trending rules (pure)

**Files:**
- Create: `functions/src/trending.ts`
- Modify: `functions/src/discovery.ts` (export `seeded` and `r4`)
- Test: `__tests__/functions/trending.test.ts`

**Interfaces:**
- Produces: `TREND_WINDOW_DAYS = 14`, `TREND_MIN = 3`, `trendDayKey(d: Date): string`, `destinationPoints(trip: { destination?: {lat?: number|null; lng?: number|null} | null; additionalDestinations?: {lat?: number|null; lng?: number|null}[] | null }): { lat: number | null; lng: number | null }[]`, `trendNewSlugs(before: string[], after: string[]): string[]`, `sameDestinationPoints(a, b): boolean`, `trendTotal(days: Record<string, number>, now: Date): number`, `trendWeight(n: number): number`, `trendPoints(dest: { slug: string; bbox: GeoBox }, weight: number): [number, number, number][]`, `pruneTrendDays(days: Record<string, number>, now: Date): Record<string, number>`, `composeHeat(baseline: Triple[], trending: Triple[], community: Triple[], cap?: number): Triple[]` where `Triple = [number, number, number]`.

- [ ] **Step 1: Export the helpers** — in `functions/src/discovery.ts` change `function seeded(` to `export function seeded(` and `const r4 =` to `export const r4 =`.

- [ ] **Step 2: Write the failing tests** (`__tests__/functions/trending.test.ts`)

```ts
import {
  TREND_MIN, composeHeat, destinationPoints, pruneTrendDays, sameDestinationPoints,
  trendDayKey, trendNewSlugs, trendPoints, trendTotal, trendWeight,
} from '../../functions/src/trending';

const NOW = new Date('2026-10-11T15:00:00Z');

describe('trendDayKey', () => {
  it('is the UTC day', () => expect(trendDayKey(new Date('2026-10-11T23:30:00-07:00'))).toBe('2026-10-12'));
});

describe('trendNewSlugs', () => {
  it('counts every city of a new trip, and only a city a later write adds', () => {
    expect(trendNewSlugs([], ['lisbon', 'porto'])).toEqual(['lisbon', 'porto']);
    expect(trendNewSlugs(['lisbon'], ['lisbon', 'porto'])).toEqual(['porto']);
  });
  it('counts nothing for an unchanged trip or a removed city', () => {
    expect(trendNewSlugs(['lisbon'], ['lisbon'])).toEqual([]);
    expect(trendNewSlugs(['lisbon', 'porto'], ['lisbon'])).toEqual([]);
  });
});

describe('destinationPoints', () => {
  it('reads the destination and its additional stops, nulls kept for ungrounded ones', () => {
    expect(destinationPoints({ destination: { lat: 1, lng: 2 }, additionalDestinations: [{ lat: null, lng: null }] }))
      .toEqual([{ lat: 1, lng: 2 }, { lat: null, lng: null }]);
    expect(destinationPoints({ destination: null })).toEqual([{ lat: null, lng: null }]);
  });
});

describe('sameDestinationPoints', () => {
  it('lets the trigger skip writes that move no destination', () => {
    const t = { destination: { lat: 1, lng: 2 } };
    expect(sameDestinationPoints(t, { destination: { lat: 1, lng: 2 } })).toBe(true);
    expect(sameDestinationPoints(t, { destination: { lat: 1, lng: 3 } })).toBe(false);
    expect(sameDestinationPoints(null, t)).toBe(false);
  });
});

describe('trendTotal', () => {
  it('sums the last 14 UTC days, today included', () => {
    expect(trendTotal({ '2026-10-11': 2, '2026-09-28': 3, '2026-09-27': 50 }, NOW)).toBe(5);
  });
  it('ignores days in the future', () => {
    expect(trendTotal({ '2026-10-12': 9, '2026-10-10': 1 }, NOW)).toBe(1);
  });
});

describe('trendWeight', () => {
  it('is nothing under the threshold, so one private trip can never be spotted', () => {
    expect(trendWeight(TREND_MIN - 1)).toBe(0);
    expect(trendWeight(0)).toBe(0);
  });
  it('grows with planning, more slowly as it grows', () => {
    expect(trendWeight(3)).toBe(24);
    expect(trendWeight(15)).toBe(48);
    expect(trendWeight(255)).toBe(96);
  });
});

describe('trendPoints', () => {
  const dest = { slug: 'lisbon', bbox: { sw: [-9.3, 38.6] as [number, number], ne: [-9.0, 38.8] as [number, number] } };
  it('spreads the weight over five points in the middle of the city, the same each time', () => {
    const p = trendPoints(dest, 10);
    expect(p).toHaveLength(5);
    expect(p.every(([lng, lat, w]) => lng > -9.25 && lng < -9.05 && lat > 38.63 && lat < 38.77 && w === 10)).toBe(true);
    expect(trendPoints(dest, 10)).toEqual(p);
  });
  it('adds nothing for a city with no weight', () => expect(trendPoints(dest, 0)).toEqual([]));
});

describe('pruneTrendDays', () => {
  it('keeps only the window', () => {
    expect(pruneTrendDays({ '2026-10-11': 1, '2026-09-28': 1, '2026-09-27': 1 }, NOW)).toEqual({ '2026-10-11': 1, '2026-09-28': 1 });
  });
});

describe('composeHeat', () => {
  it('with no trending, is exactly baseline plus community, heaviest first', () => {
    expect(composeHeat([[1, 1, 5]], [], [[2, 2, 9]])).toEqual([[2, 2, 9], [1, 1, 5]]);
  });
  it('adds trending points and caps the total', () => {
    expect(composeHeat([[1, 1, 5]], [[3, 3, 24]], [[2, 2, 9]], 2)).toEqual([[3, 3, 24], [2, 2, 9]]);
  });
});
```

- [ ] **Step 3: Run** `npx jest __tests__/functions/trending.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `functions/src/trending.ts`:

```ts
/**
 * Trending destinations (docs/superpowers/specs/2026-10-11-trending-destinations-design.md):
 * anonymous per-city counts of trips started, turned into globe heat. Pure — no firebase-admin.
 */
import { seeded, r4, type GeoBox } from './discovery';

export type Triple = [number, number, number];
export const TREND_WINDOW_DAYS = 14;
/** Below this many trips in the window a city adds nothing: one private trip can never be spotted. */
export const TREND_MIN = 3;
const DAY_MS = 86_400_000;

export function trendDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Pt = { lat?: number | null; lng?: number | null } | null | undefined;
export function destinationPoints(trip: { destination?: Pt; additionalDestinations?: Pt[] | null }): { lat: number | null; lng: number | null }[] {
  return [trip.destination, ...(trip.additionalDestinations ?? [])].map((d) => ({ lat: d?.lat ?? null, lng: d?.lng ?? null }));
}

export function sameDestinationPoints(
  a: { destination?: Pt; additionalDestinations?: Pt[] | null } | null | undefined,
  b: { destination?: Pt; additionalDestinations?: Pt[] | null } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return JSON.stringify(destinationPoints(a)) === JSON.stringify(destinationPoints(b));
}

export function trendNewSlugs(before: string[], after: string[]): string[] {
  const had = new Set(before);
  return after.filter((s) => !had.has(s));
}

function windowStart(now: Date): string {
  return trendDayKey(new Date(now.getTime() - (TREND_WINDOW_DAYS - 1) * DAY_MS));
}

export function trendTotal(days: Record<string, number>, now: Date): number {
  const from = windowStart(now), to = trendDayKey(now);
  return Object.entries(days).reduce((n, [k, v]) => (k >= from && k <= to ? n + (Number(v) || 0) : n), 0);
}

export function trendWeight(n: number): number {
  return n < TREND_MIN ? 0 : Math.round(12 * Math.log2(1 + n));
}

export function trendPoints(dest: { slug: string; bbox: GeoBox }, weight: number): Triple[] {
  if (weight <= 0) return [];
  const { sw, ne } = dest.bbox;
  return Array.from({ length: 5 }, (_, i) => {
    // Its own seed ('trend:'), so the points don't sit on the baseline's.
    const fx = 0.2 + 0.6 * seeded(`trend:${dest.slug}`, i * 2);
    const fy = 0.2 + 0.6 * seeded(`trend:${dest.slug}`, i * 2 + 1);
    return [r4(sw[0] + (ne[0] - sw[0]) * fx), r4(sw[1] + (ne[1] - sw[1]) * fy), weight] as Triple;
  });
}

export function pruneTrendDays(days: Record<string, number>, now: Date): Record<string, number> {
  const from = windowStart(now);
  return Object.fromEntries(Object.entries(days).filter(([k]) => k >= from));
}

export function composeHeat(baseline: Triple[], trending: Triple[], community: Triple[], cap = 4000): Triple[] {
  return [...baseline, ...trending, ...community].sort((a, b) => b[2] - a[2]).slice(0, cap);
}
```

- [ ] **Step 5: Run** `npx jest __tests__/functions/trending.test.ts __tests__/functions/discovery.test.ts` — Expected: PASS. Then `cd functions && npm run build` — Expected: no errors.

- [ ] **Step 6: Commit** — `git add functions/src/trending.ts functions/src/discovery.ts __tests__/functions/trending.test.ts && git commit -m "feat(trending): pure rules — day keys, new cities, 14-day window, threshold, weight, heat"`

---

### Task 2: Trigger, refresh job, daily job hand-off, rules

**Files:**
- Create: `functions/src/trendingFunctions.ts`
- Modify: `functions/src/discoveryFunctions.ts` (save community points; export `loadCatalog`), `functions/src/index.ts`, `firestore.rules`

**Interfaces:**
- Consumes: everything Task 1 produces; `destinationKeysFor`, `baselinePoints`, `isEditorialTrip` (discovery.ts); `editorialUid` and `loadCatalog` (discoveryFunctions.ts — export them).
- Produces: `onTripWrittenTrend`, `refreshTrending` (Cloud Functions); `runTrendRefresh(): Promise<{ cities: number; points: number; wrote: boolean }>` for the backfill script; `serverState/heatCommunity` = `{ points: number[] (flattened triples), stride: 3, updatedAt }`.

- [ ] **Step 1: Daily job saves its community points.** In `runAggregation`, build `const communityTriples = community.map((c) => [r4(c.lng), r4(c.lat), 1 + 2 * c.saves + c.likes] as [number, number, number]);` and add to the batch `batch.set(db().doc('serverState/heatCommunity'), { points: communityTriples.flat(), stride: 3, updatedAt: now });`. Replace the heatmap line with `composeHeat(catalog.flatMap((d) => baselinePoints(d)), await currentTrendPoints(catalog), communityTriples)` where `currentTrendPoints` is exported from `trendingFunctions.ts` (so the daily rebuild keeps the trending layer). Export `loadCatalog` and `editorialUid`.

- [ ] **Step 2: Write `functions/src/trendingFunctions.ts`:**

```ts
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { baselinePoints, destinationKeysFor, isEditorialTrip, type GeoBox } from './discovery';
import { editorialUid, loadCatalog } from './discoveryFunctions';
import {
  composeHeat, destinationPoints, pruneTrendDays, sameDestinationPoints, trendDayKey,
  trendNewSlugs, trendPoints, trendTotal, trendWeight, type Triple,
} from './trending';

const db = () => admin.firestore();

/** Every new or re-destined trip, any visibility, counted per catalog city — anonymously (trendCounts is server-only). */
export const onTripWrittenTrend = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return; // deletions subtract nothing
  if (sameDestinationPoints(before, after)) return; // trips are written constantly
  if (isEditorialTrip(after, editorialUid())) return;
  const catalog = await loadCatalog();
  const added = trendNewSlugs(
    before ? destinationKeysFor(destinationPoints(before), catalog) : [],
    destinationKeysFor(destinationPoints(after), catalog),
  );
  if (added.length === 0) return;
  const day = trendDayKey(new Date());
  const batch = db().batch();
  for (const slug of added) {
    batch.set(db().doc(`trendCounts/${slug}`), { days: { [day]: admin.firestore.FieldValue.increment(1) } }, { merge: true });
  }
  await batch.commit();
});

/** The trending layer for the catalog right now. */
export async function currentTrendPoints(catalog: { slug: string; bbox: GeoBox }[]): Promise<Triple[]> {
  const snap = await db().collection('trendCounts').get();
  const now = new Date();
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  return snap.docs.flatMap((d) => {
    const dest = bySlug.get(d.id);
    return dest ? trendPoints(dest, trendWeight(trendTotal((d.get('days') ?? {}) as Record<string, number>, now))) : [];
  });
}

function triples(flat: unknown, stride: unknown): Triple[] {
  if (!Array.isArray(flat) || stride !== 3) return [];
  const out: Triple[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]] as Triple);
  return out;
}

/** Rebuilds the globe's heat from baseline + trending + the daily job's community points. */
export async function runTrendRefresh(): Promise<{ cities: number; points: number; wrote: boolean }> {
  const catalog = await loadCatalog();
  const trending = await currentTrendPoints(catalog);
  const communitySnap = await db().doc('serverState/heatCommunity').get();
  const community = triples(communitySnap.get('points'), communitySnap.get('stride'));
  const points = composeHeat(catalog.flatMap((d) => baselinePoints(d)), trending, community).flat();
  const ref = db().doc('aggregates/heatmap');
  const current = (await ref.get()).get('points') as number[] | undefined;
  const wrote = JSON.stringify(current ?? []) !== JSON.stringify(points);
  if (wrote) await ref.set({ points, stride: 3, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  // Keep trendCounts small: drop days outside the window.
  const now = new Date();
  const counts = await db().collection('trendCounts').get();
  await Promise.all(counts.docs.map((d) => {
    const days = (d.get('days') ?? {}) as Record<string, number>;
    const kept = pruneTrendDays(days, now);
    return Object.keys(kept).length === Object.keys(days).length ? null : d.ref.set({ days: kept });
  }));
  return { cities: trending.length / 5, points: points.length / 3, wrote };
}

export const refreshTrending = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 120 }, async () => {
  await runTrendRefresh();
});
```

- [ ] **Step 3: Export** in `functions/src/index.ts`: `export { onTripWrittenTrend, refreshTrending } from './trendingFunctions';`.

- [ ] **Step 4: Rules** — add before `match /aggregates/{docId}` in `firestore.rules`:

```
    // Trending (functions/src/trendingFunctions.ts): anonymous per-city counts and the daily
    // job's saved points. Server only — clients see only the combined aggregates/heatmap.
    match /trendCounts/{slug} {
      allow read, write: if false;
    }
    match /serverState/{docId} {
      allow read, write: if false;
    }
```

- [ ] **Step 5: Build, test, deploy**

Run: `cd functions && npm run build && cd .. && npx jest __tests__/functions` — Expected: no build errors; all pass.
Run: `firebase deploy --only firestore:rules,functions:onTripWrittenTrend,functions:refreshTrending,functions:aggregateDiscovery --project supernova-a2125` — Expected: "Deploy complete!".

- [ ] **Step 6: Commit** — `git add functions/src firestore.rules && git commit -m "feat(trending): count trips per city as they're planned; heat rebuilt every 15 minutes"`

---

### Task 3: Backfill, app refresh, privacy, docs

**Files:**
- Create: `scripts/backfill-trends.mjs`
- Modify: `hooks/useHeatmap.ts`, `hosting/privacy.html`, `CLAUDE.md`

- [ ] **Step 1: Backfill script** (`scripts/backfill-trends.mjs`, Admin SDK, key at `~/.config/supernova/service-account.json`, same bootstrap as `scripts/backfill-shared-bookings.mjs`): read trips with `createdAt >= now - 14 days`; skip editorial (`isEditorial === true` and `authorUid` = the editorial account's uid looked up by `users.isEditorial == true`); map each trip's `destination` + `additionalDestinations` points to catalog slugs (boxes from `destinations/*.bbox`, same in-box rule as `destinationKeysFor`); count per slug per UTC day of `createdAt`; with `--dry-run` print the counts, otherwise **set** (not increment) `trendCounts/{slug}.days` for those days so re-running is safe; then print a reminder to run the refresh. Then call the refresh by requiring the compiled `functions/lib/trendingFunctions.js` `runTrendRefresh()` (after `cd functions && npm run build`) and print its result.

- [ ] **Step 2: Run** `node scripts/backfill-trends.mjs --dry-run` — Expected: per-city counts; then without `--dry-run` — Expected: counts written and `{ cities, points, wrote: true }`.

- [ ] **Step 3: App** — `hooks/useHeatmap.ts`: `staleTime: 10 * 60 * 1000`, `refetchOnWindowFocus: true`, and update the doc comment ("rebuilt every 15 minutes by refreshTrending").

- [ ] **Step 4: Privacy** — `hosting/privacy.html`: in "How we use it" add the spec sentence; bump "Effective" to October 11, 2026 (already) — then `firebase deploy --only hosting`.

- [ ] **Step 5: CLAUDE.md** — under Cloud Functions after `tagTripDestinations / aggregateDiscovery`, add a **Trending** bullet: trigger + `trendCounts` (server-only, any visibility, cities added only, never subtracted), `refreshTrending` every 15 min (14 days, ≥ 3, log weight, `composeHeat`, writes only on change, prunes), `serverState/heatCommunity` hand-off, backfill script, `useHeatmap` 10 min.

- [ ] **Step 6: Verify and commit** — `npx jest --silent && npx tsc --noEmit -p . && npm run lint` (0 errors), then `git add scripts/backfill-trends.mjs hooks/useHeatmap.ts hosting/privacy.html CLAUDE.md && git commit -m "feat(trending): backfill, the globe re-reads every 10 minutes, privacy policy, docs"`.
