# Trip flyover director: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trip map flyover one smooth, calm "film" for every trip length. The camera is planned as a few long seamless shots, and each stop card names its place.

**Architecture:**
- **The clock stays.** The existing flyover reducer (`utils/flyover.ts`) keeps drawing the route.
- **It gains two inputs:** per-day intro lengths (`intros`), and per-day **speed profiles** (path-fraction regions with a duration each), so the drawing head and the camera share one timeline.
- **The planner.** A new pure planner, `utils/flyoverDirector.ts`, turns each day into a `DayPlan`: establish camera, glide segments (2–4 s, constant screen speed, smoothed path, gentle heading), features (slow-in, close orbit, pull back), transfers (Mapbox `flyTo` arcs), card texts, dwells and the speed profile.
- **The runner.** `TripMapView` feeds the plan to the reducer and runs one camera command per shot or segment. This replaces the one-second follow camera, the separate arrive/circle code, and highlights playback.

**Tech Stack:** Expo / React Native, @rnmapbox/maps `Camera.setCamera` (`easeTo` | `linearTo` | `flyTo`), Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-11-11-flyover-director-design.md`

## Global Constraints

**Shots**
- Shot kinds: `establish` (3 s; 2 s in film), `glide`, `feature`, `transfer`.

**Glides**
- Segments are 2–4 s each, sent as `linearTo`.
- The heading turns ≤ 12° a second.
- The zoom steps ≤ 0.15 between consecutive glide segments.
- Screen speed is ≤ 35% of a 390 pt screen width per second at the segment's zoom (Mapbox: metres per point = `78271.517 × cos(lat) / 2^zoom`).
- The camera follows the route smoothed with a moving average: about 600 m on walking legs, about 2 km on drive/bus legs.
- The last two segments before a feature are ×1.4 and ×1.8 longer.

**Features**
- Every stop on short trips. On long trips (`isLongTrip`), up to 3 a day, chosen by photos first, then `type === 'activity'`, then most central (`momentStop`).
- Camera: zoom 15.5, pitch 60, orbit bearing +40, ending at the next glide's zoom.
- Hold: 4000 ms + 2000 ms per photo (≤ 4). Long trips: 3000 ms + 2000 ms per photo (≤ 4). Film: 3000 ms + 1500 ms per photo (≤ 2).

**Transfers**
- Any jump > 25 km (between days, or a leg within a day).
- One `flyTo` of 3–5 s, scaled by distance.
- The card reads `travelLabel(travel, destination name)`.

**Cards**
- Eyebrow: `DAY n · {day title without "Day N:"}`, else `DAY n · {CITY}`, else `DAY n`.
- Title: the stop's `placeName || title` for glides and features; the destination for a transfer.
- The city is never the title while a stop is shown.

**Pacing (playback)**
- Establish plus glides per day: 5–11 s on short trips; glides ≤ 6 s on long trips. A day flies higher (lower zoom, never under 11) to meet that.
- Features and transfers are added on top.

**Film**
- `totalMs ≤ FILM_BUDGET_MS` (54 000) for trips of up to 10 days.
- Order of squeezing:
  1. features → photo stops only;
  2. 2 s establish;
  3. glides at cap;
  4. an overview glide (camera stays on the establish frame, the line draws in 1.5 s);
  5. no features.
- Never faster than the playback screen-speed cap.

**General**
- No new cost: no server and no new Mapbox calls (route legs come from the existing cache).
- Pure tests only: `npx jest <path>`; suite `npx jest`; typecheck `npx tsc --noEmit -p .`.

**Ruling against the spec**

The spec says "a day comes out at about 8–15 s, so a two-week trip takes 2–3 minutes". With three 4 s features that can't hold. So long trips get 3 s features and ≤ 6 s glides, and a two-week trip takes about 3–3.5 minutes. The comfort caps (screen speed, turn rate, no seams) win over the length estimate. Cost if wrong: long-trip playback runs about a minute longer than the owner pictured.

## Review Focus

1. **A day whose stops have no route yet** (cache missing → straight lines) **or only one stop:** it must still establish and feature without throwing, and must never produce a 0 ms or NaN segment. Pinned in Task 3.
2. **A long drive or flight leg inside a day** (> 25 km): it must become one transfer arc, not 40 s of glide. Pinned in Task 3.
3. **Pause, resume or jump in the middle of a glide:** the runner must resume from the segment under the head, not replay or skip. Pinned by `segmentAt` in Task 2 and used in Task 4.
4. **Stops at the same spot** (two stops 0 m apart) **and stops at fraction 0 or 1:** no zero-length segments, and features at those stops still get their hold. Pinned in Task 2.
5. **Film for a 14-day trip:** it must end, with camera speed under the cap, and no NaN. Pinned in Task 3. Its length can exceed the budget beyond 10 days (documented).

---

### Task 1: Reducer gains per-day intros and speed profiles

**Files:**
- Modify: `utils/flyover.ts` (`FlyoverTiming`, `startOfDay`, the tick speed)
- Test: `__tests__/utils/flyover.test.ts` (append; check the file exists with `ls __tests__/utils/flyover*.test.ts` and use it)

**Interfaces:**
- Produces:
  - `FlyoverTiming.intros?: number[]`: per-day intro hold, overriding `introMs`.
  - `FlyoverTiming.profiles?: { to: number; ms: number }[][]`: per day, consecutive regions of path fraction, each drawn in `ms`. The first region starts at 0, and the last `to` is 1.
  - `profileSpeed(profile: { to: number; ms: number }[], progress: number): number`: path fraction per ms for the region holding `progress`.

- [ ] **Step 1: Write the failing tests.** Append:

```ts
import { flyoverReducer, initialFlyover, profileSpeed, DEFAULT_TIMING } from '@/utils/flyover';

describe('speed profiles and per-day intros (flyover director, 2026-11-11)', () => {
  const profile = [{ to: 0.25, ms: 1000 }, { to: 1, ms: 3000 }];
  it('profileSpeed is the region span over its time', () => {
    expect(profileSpeed(profile, 0.1)).toBeCloseTo(0.25 / 1000);
    expect(profileSpeed(profile, 0.5)).toBeCloseTo(0.75 / 3000);
    expect(profileSpeed([], 0.5)).toBe(0);
  });
  it('a day opens with its own intro', () => {
    const timing = { ...DEFAULT_TIMING, intros: [1500, 6000] };
    const s = flyoverReducer(initialFlyover, { type: 'play', timing });
    expect(s.hold).toBe(1500);
    expect(flyoverReducer(s, { type: 'jump', dayIndex: 1, timing }).hold).toBe(6000);
  });
  it('the head follows the profile, not the day duration', () => {
    const timing = { ...DEFAULT_TIMING, intros: [0], dwells: [[0, 0]], profiles: [profile], legMinMs: 3000 };
    let s = flyoverReducer(initialFlyover, { type: 'play', timing });
    s = flyoverReducer(s, { type: 'tick', dt: 100, durations: [99_999], stopFractions: [[0, 1]], timing });
    expect(s.progress).toBeCloseTo(0.025, 3);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/flyover.test.ts`
  - Expected: FAIL (`profileSpeed` is not exported, and the intros are ignored).

- [ ] **Step 3: Implement.** In `utils/flyover.ts`:
  - Add to `FlyoverTiming`:

```ts
  /** Per day: how long it opens (director: establish, transfer, a stop-0 feature) — overrides `introMs`. */
  intros?: number[];
  /** Per day: consecutive path-fraction regions and how long each is drawn — overrides the day duration and `legMinMs`. */
  profiles?: { to: number; ms: number }[][];
```

  - Export:

```ts
/** Drawing speed in the profile region holding `progress` (path fraction per ms); 0 with no profile. */
export function profileSpeed(profile: { to: number; ms: number }[], progress: number): number {
  let from = 0;
  for (const r of profile) {
    if (progress < r.to || r === profile[profile.length - 1]) return r.ms > 0 ? (r.to - from) / r.ms : 1;
    from = r.to;
  }
  return 0;
}
```

  - Change `startOfDay` to use `timing.intros?.[dayIndex] ?? timing.introMs` for `hold`.
  - In the `tick` case, replace the `const speed = legSpeed(…)` line with:

```ts
      const profile = timing.profiles?.[state.dayIndex];
      const speed = profile?.length ? profileSpeed(profile, state.progress) : legSpeed(action.stopFractions[state.dayIndex] ?? [], state.stopIndex, duration, timing.legMinMs ?? 0);
```

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/utils/flyover.test.ts`
  - Expected: PASS, including the existing tests.

- [ ] **Step 5: Commit.**

```bash
git add utils/flyover.ts __tests__/utils/flyover.test.ts
git commit -m "feat(flyover): per-day intros and speed profiles for the director"
```

---

### Task 2: Director geometry: smoothed camera line and glide segments

**Files:**
- Create: `utils/flyoverDirector.ts` (geometry part)
- Test: `__tests__/utils/flyoverDirector.test.ts`

**Interfaces:**
- Consumes: `haversineMeters` (`utils/tripRoutes`), `legPitch` (`utils/flyoverCamera`).
- Produces:
  - `type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number }`
  - `type Segment = { from: number; to: number; ms: number; camera: Camera; move: 'linearTo' | 'easeTo' | 'flyTo' }` (`from`/`to` are day-path fractions)
  - `SCREEN_SPEED_PTS = 0.35 * 390`; `metersPerPoint(lat: number, zoom: number): number`
  - `samplePath(coords: [number, number][], stepM = 50): { lng: number; lat: number; f: number }[]`, where `f` is the path fraction by distance
  - `smoothLine(samples, windowM: number): { lng: number; lat: number; f: number }[]`
  - `glideSegments(i: { coords: [number, number][]; zoom: number; windowM: number; from: number; to: number; slowIn: boolean; startBearing: number }): Segment[]`. It covers path fractions `[from, to]` with 2–4 s `linearTo` segments at the screen-speed cap.
  - `segmentAt(segments: Segment[], progress: number): number`, the index of the segment holding `progress` (the last one if past the end).
  - `angleDelta(a: number, b: number): number`, the signed shortest turn in degrees.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/flyoverDirector.test.ts`:

```ts
import { angleDelta, glideSegments, metersPerPoint, samplePath, segmentAt, smoothLine, SCREEN_SPEED_PTS } from '@/utils/flyoverDirector';

// A zig-zag walk through a city grid, ~3 km, at Mexico City's latitude.
const zig: [number, number][] = [[-99.133, 19.432], [-99.128, 19.432], [-99.128, 19.428], [-99.122, 19.428], [-99.122, 19.424], [-99.116, 19.424]];

describe('geometry', () => {
  it('samples a path every ~50 m with fractions 0..1', () => {
    const s = samplePath(zig);
    expect(s[0].f).toBe(0);
    expect(s[s.length - 1].f).toBeCloseTo(1);
    expect(s.length).toBeGreaterThan(40);
  });
  it('smoothing keeps the ends and softens the corners', () => {
    const s = samplePath(zig);
    const m = smoothLine(s, 600);
    expect(m[0].lng).toBeCloseTo(s[0].lng, 3);
    expect(m.length).toBe(s.length);
  });
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
});

describe('glideSegments — comfort limits', () => {
  const segs = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: false, startBearing: 90 });
  it('covers the span exactly, in order, with no zero-length segment', () => {
    expect(segs[0].from).toBe(0);
    expect(segs[segs.length - 1].to).toBe(1);
    segs.forEach((g, i) => { expect(g.to).toBeGreaterThan(g.from); if (i) expect(g.from).toBe(segs[i - 1].to); });
  });
  it('every segment lasts 2–4 s', () => {
    segs.forEach((g) => { expect(g.ms).toBeGreaterThanOrEqual(2000); expect(g.ms).toBeLessThanOrEqual(4000 * 1.8); });
  });
  it('turns at most 12° a second', () => {
    let prev = 90;
    segs.forEach((g) => { expect(Math.abs(angleDelta(prev, g.camera.bearing))).toBeLessThanOrEqual(12 * (g.ms / 1000) + 1e-6); prev = g.camera.bearing; });
  });
  it('never moves faster than the screen-speed cap', () => {
    const lat = 19.43;
    segs.forEach((g) => {
      // Path metres covered in this segment, at the camera's zoom, per second.
      const meters = (g.to - g.from) * 3000;
      const ptsPerSec = meters / metersPerPoint(lat, g.camera.zoom) / (g.ms / 1000);
      expect(ptsPerSec).toBeLessThanOrEqual(SCREEN_SPEED_PTS * 1.25);
    });
  });
  it('slows into a feature (last two segments longer)', () => {
    const s = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: true, startBearing: 90 });
    const n = s.length;
    expect(s[n - 1].ms).toBeGreaterThan(s[n - 3].ms);
    expect(s[n - 2].ms).toBeGreaterThan(s[n - 3].ms);
  });
  it('a zero-length span (two stops at one spot) gives no segments', () => {
    expect(glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0.4, to: 0.4, slowIn: true, startBearing: 0 })).toEqual([]);
  });
});

describe('segmentAt (review focus 3: resume mid-glide)', () => {
  const segs = [{ from: 0, to: 0.3 }, { from: 0.3, to: 0.7 }, { from: 0.7, to: 1 }] as never[];
  it('finds the segment under the head', () => {
    expect(segmentAt(segs, 0)).toBe(0);
    expect(segmentAt(segs, 0.5)).toBe(1);
    expect(segmentAt(segs, 0.7)).toBe(2);
    expect(segmentAt(segs, 1)).toBe(2);
  });
});
```

  The speed test's `(g.to - g.from) * 3000` is the zig-zag's path length. Compute it once from `samplePath`'s total if the zig-zag isn't ~3000 m: replace `3000` with `const total = …` derived from `haversineMeters` over `zig`.

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/flyoverDirector.test.ts`
  - Expected: FAIL (cannot find the module).

- [ ] **Step 3: Implement the geometry.** Create `utils/flyoverDirector.ts`:

```ts
/**
 * The trip flyover's director (spec 2026-11-11-flyover-director-design.md): plans each day as a few long, seamless
 * camera shots — establish, glide, feature, transfer — so playback feels like flying above the trip as it comes alive.
 * Pure: no React, no Mapbox. TripMapView runs the plan; utils/flyover's reducer stays the clock.
 */
import { haversineMeters } from '@/utils/tripRoutes';
import { legPitch } from '@/utils/flyoverCamera';

export type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };
export type Segment = { from: number; to: number; ms: number; camera: Camera; move: 'linearTo' | 'easeTo' | 'flyTo' };

/** 35% of a phone's width (390 pt) per second — calm at any zoom. */
export const SCREEN_SPEED_PTS = 0.35 * 390;
const MAX_TURN_DEG_S = 12;
const SEG_MS = 3000;
const SEG_MIN_MS = 2000;

export const metersPerPoint = (lat: number, zoom: number) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

export const angleDelta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
const norm = (d: number) => ((d % 360) + 360) % 360;

function bearingOf(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return norm((Math.atan2(y, x) * 180) / Math.PI);
}

export function samplePath(coords: [number, number][], stepM = 50): { lng: number; lat: number; f: number }[] {
  if (coords.length < 2) return coords.map(([lng, lat]) => ({ lng, lat, f: 0 }));
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineMeters({ lat: coords[i - 1][1], lng: coords[i - 1][0] }, { lat: coords[i][1], lng: coords[i][0] }));
  const total = cum[cum.length - 1];
  if (total <= 0) return [{ lng: coords[0][0], lat: coords[0][1], f: 0 }, { lng: coords[0][0], lat: coords[0][1], f: 1 }];
  const out: { lng: number; lat: number; f: number }[] = [];
  let j = 1;
  for (let d = 0; d < total; d += stepM) {
    while (cum[j] < d) j++;
    const t = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push({ lng: coords[j - 1][0] + t * (coords[j][0] - coords[j - 1][0]), lat: coords[j - 1][1] + t * (coords[j][1] - coords[j - 1][1]), f: d / total });
  }
  out.push({ lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], f: 1 });
  return out;
}

/** A moving average over ~windowM: the camera floats above the street pattern instead of tracing every corner. */
export function smoothLine(s: { lng: number; lat: number; f: number }[], windowM: number): { lng: number; lat: number; f: number }[] {
  const k = Math.max(1, Math.round(windowM / 50 / 2));
  return s.map((p, i) => {
    if (i === 0 || i === s.length - 1) return p;
    const a = Math.max(0, i - k), b = Math.min(s.length - 1, i + k);
    let lng = 0, lat = 0;
    for (let x = a; x <= b; x++) { lng += s[x].lng; lat += s[x].lat; }
    return { lng: lng / (b - a + 1), lat: lat / (b - a + 1), f: p.f };
  });
}

/** Glides over path fractions [from, to]: 2–4 s linearTo segments at the screen-speed cap, heading eased ≤ 12°/s. */
export function glideSegments(i: { coords: [number, number][]; zoom: number; windowM: number; from: number; to: number; slowIn: boolean; startBearing: number }): Segment[] {
  if (!(i.to > i.from)) return [];
  const all = smoothLine(samplePath(i.coords), i.windowM);
  const span = all.filter((p) => p.f >= i.from - 1e-9 && p.f <= i.to + 1e-9);
  if (span.length < 2) return [];
  let total = 0;
  for (let k = 1; k < span.length; k++) total += haversineMeters(span[k - 1], span[k]);
  const lat = span[0].lat;
  const mps = (SCREEN_SPEED_PTS * metersPerPoint(lat, i.zoom));
  const totalMs = Math.max(SEG_MIN_MS, (total / mps) * 1000);
  const n = Math.max(1, Math.round(totalMs / SEG_MS));
  const segs: Segment[] = [];
  let bearing = i.startBearing;
  for (let s = 0; s < n; s++) {
    const f0 = i.from + ((i.to - i.from) * s) / n, f1 = i.from + ((i.to - i.from) * (s + 1)) / n;
    const end = span.reduce((best, p) => (Math.abs(p.f - f1) < Math.abs(best.f - f1) ? p : best), span[0]);
    const start = span.reduce((best, p) => (Math.abs(p.f - f0) < Math.abs(best.f - f0) ? p : best), span[0]);
    const ms = Math.max(SEG_MIN_MS, totalMs / n);
    const want = start === end ? bearing : bearingOf(start, end);
    const turn = Math.max(-MAX_TURN_DEG_S * (ms / 1000), Math.min(MAX_TURN_DEG_S * (ms / 1000), angleDelta(bearing, want)));
    bearing = norm(bearing + turn);
    segs.push({ from: f0, to: f1, ms, move: 'linearTo', camera: { center: [end.lng, end.lat], zoom: i.zoom, pitch: legPitch(i.zoom), bearing } });
  }
  if (i.slowIn && segs.length >= 1) {
    segs[segs.length - 1].ms *= 1.8;
    if (segs.length >= 2) segs[segs.length - 2].ms *= 1.4;
  }
  segs[segs.length - 1].to = i.to;
  return segs;
}

export function segmentAt(segments: { from: number; to: number }[], progress: number): number {
  for (let k = 0; k < segments.length; k++) if (progress < segments[k].to) return k;
  return Math.max(0, segments.length - 1);
}
```

  Check that `legPitch`'s signature is `(zoom: number) => number` with `grep -n "export function legPitch" utils/flyoverCamera.ts`, and that `haversineMeters` takes `{lat, lng}` objects.

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/utils/flyoverDirector.test.ts`
  - Expected: PASS. If the speed or turn tests fail, fix the implementation (segment count, or bearing clamp); never loosen the limits.

- [ ] **Step 5: Commit.**

```bash
git add utils/flyoverDirector.ts __tests__/utils/flyoverDirector.test.ts
git commit -m "feat(flyover): director geometry — smoothed camera line, calm glide segments"
```

---

### Task 3: Director day plans: features, cards, transfers, film

**Files:**
- Modify: `utils/flyoverDirector.ts`: add the day planner.
- Test: `__tests__/utils/flyoverDirector.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 exports; `momentStop` (`utils/highlights`); `stripDayPrefix` (`utils/highlights`); `travelLabel` (`utils/playback`); `legTravel`, `Travel`, `RouteStop` (`utils/tripRoutes`); `FILM_BUDGET_MS` (`utils/flyover`).
- Produces:
  - `type DirectorStop = { id: string; name: string; type: string; lat: number; lng: number; photoCount: number }`
  - `type DirectorDay = { dayId: string; dayNumber: number; label: string | null; city: string | null; stops: DirectorStop[]; path: { coordinates: [number, number][]; stopFractions: number[]; meters: number; legs: { travel: string; startFraction: number; endFraction: number; meters: number }[] } }`
  - `type DayPlan = { dayId: string; establish: { camera: Camera; overviewMs: number; descendMs: number; bounds: { ne: [number, number]; sw: [number, number] } | null }; transfer: { camera: Camera; ms: number; label: string } | null; introMs: number; features: number[]; featureMs: Record<number, number>; dwells: number[]; segments: Segment[]; profile: { to: number; ms: number }[]; glideMs: number; cards: { eyebrow: string; titles: string[] } }`
  - `pickFeatures(stops: DirectorStop[], long: boolean): number[]`
  - `dayEyebrow(dayNumber: number, label: string | null, city: string | null): string`
  - `directFlyover(days: DirectorDay[], o: { long: boolean; film: boolean; budgetMs?: number }): { days: DayPlan[]; totalMs: number }`

- [ ] **Step 1: Write the failing tests.** Append:

```ts
import { dayEyebrow, directFlyover, pickFeatures, type DirectorDay } from '@/utils/flyoverDirector';

const stop = (id: string, name: string, lat: number, lng: number, type = 'activity', photoCount = 0) => ({ id, name, type, lat, lng, photoCount });
const dayFrom = (n: number, stops: ReturnType<typeof stop>[], label: string | null = null): DirectorDay => {
  const coords = stops.map((s) => [s.lng, s.lat] as [number, number]);
  let cum = 0; const cums = [0];
  for (let i = 1; i < stops.length; i++) { cum += Math.hypot(stops[i].lng - stops[i - 1].lng, stops[i].lat - stops[i - 1].lat); cums.push(cum); }
  return { dayId: `d${n}`, dayNumber: n, label, city: 'Mexico City', stops,
    path: { coordinates: coords, stopFractions: cums.map((c) => (cum ? c / cum : 0)), meters: cum * 111_000,
      legs: stops.slice(1).map((s, i) => ({ travel: 'walk', startFraction: cum ? cums[i] / cum : 0, endFraction: cum ? cums[i + 1] / cum : 1, meters: (cums[i + 1] - cums[i]) * 111_000 })) } };
};
const cdmx = [stop('a', 'Zócalo', 19.4326, -99.1332), stop('b', 'Metropolitan Cathedral', 19.4342, -99.1331), stop('c', 'National Palace', 19.4327, -99.1313, 'activity', 2), stop('d', 'El Cardenal', 19.4357, -99.1385, 'restaurant')];

describe('pickFeatures', () => {
  it('every stop on short trips', () => {
    expect(pickFeatures(cdmx, false)).toEqual([0, 1, 2, 3]);
  });
  it('long trips: ≤ 3, photos first, then sights, then central', () => {
    const f = pickFeatures([...cdmx, stop('e', 'Bellas Artes', 19.4352, -99.1412), stop('f', 'Café', 19.43, -99.14, 'restaurant')], true);
    expect(f).toHaveLength(3);
    expect(f).toContain(2);
  });
});

describe('cards', () => {
  it('eyebrow uses the day title without "Day N:", else the city', () => {
    expect(dayEyebrow(3, 'Day 3: Ancient pyramids & culinary', 'Mexico City')).toBe('DAY 3 · ANCIENT PYRAMIDS & CULINARY');
    expect(dayEyebrow(3, null, 'Mexico City')).toBe('DAY 3 · MEXICO CITY');
    expect(dayEyebrow(3, null, null)).toBe('DAY 3');
  });
  it('titles are the stops\' own names — never the city (owner: "Mexico City" on every stop)', () => {
    const plan = directFlyover([dayFrom(1, cdmx)], { long: true, film: false }).days[0];
    expect(plan.cards.titles).toEqual(['Zócalo', 'Metropolitan Cathedral', 'National Palace', 'El Cardenal']);
    expect(plan.cards.titles).not.toContain('Mexico City');
  });
});

describe('directFlyover — playback', () => {
  const plan = directFlyover([dayFrom(1, cdmx, 'Day 1: Centro')], { long: false, film: false });
  const d = plan.days[0];
  it('dwells only at features; others pulse past (0)', () => {
    const long = directFlyover([dayFrom(1, [...cdmx, stop('e', 'X', 19.44, -99.14, 'restaurant'), stop('f', 'Y', 19.441, -99.141, 'restaurant')])], { long: true, film: false }).days[0];
    long.dwells.forEach((ms, i) => expect(ms > 0).toBe(long.features.includes(i) && i > 0));
  });
  it('the profile covers 0 → 1 and its time equals the glides', () => {
    expect(d.profile[d.profile.length - 1].to).toBeCloseTo(1);
    expect(d.profile.reduce((a, r) => a + r.ms, 0)).toBeCloseTo(d.glideMs);
    expect(d.segments.reduce((a, s) => a + s.ms, 0)).toBeCloseTo(d.glideMs);
  });
  it('establish + glides stay calm (5–11 s on a short-trip day)', () => {
    expect(d.introMs).toBeGreaterThanOrEqual(3000);
    expect(3000 + d.glideMs).toBeGreaterThanOrEqual(5000);
    expect(3000 + d.glideMs).toBeLessThanOrEqual(11_000 + 1e-6);
  });
  it('feature holds: 4 s + 2 s a photo on short trips', () => {
    expect(d.featureMs[2]).toBe(8000);
    expect(d.featureMs[1]).toBe(4000);
  });
});

describe('transfers (review focus 2)', () => {
  it('a > 25 km jump between days becomes one arc with a travel label', () => {
    const teo = [stop('t', 'Teotihuacán', 19.6925, -98.8438), stop('u', 'Pyramid of the Moon', 19.6997, -98.8441)];
    const plan = directFlyover([dayFrom(1, cdmx), dayFrom(2, teo)], { long: false, film: false });
    expect(plan.days[0].transfer).toBeNull();
    expect(plan.days[1].transfer?.label).toMatch(/Teotihuacán/);
    expect(plan.days[1].transfer!.ms).toBeGreaterThanOrEqual(3000);
    expect(plan.days[1].transfer!.ms).toBeLessThanOrEqual(5000);
  });
});

describe('edge cases (review focus 1, 4)', () => {
  it('one stop, no route: establish + feature, no segments, no NaN', () => {
    const one = directFlyover([dayFrom(1, [cdmx[0]])], { long: false, film: false }).days[0];
    expect(one.segments).toEqual([]);
    expect(Number.isFinite(one.introMs)).toBe(true);
  });
  it('two stops at one spot: no zero-length segment', () => {
    const p = directFlyover([dayFrom(1, [cdmx[0], cdmx[0], cdmx[2]])], { long: false, film: false }).days[0];
    p.segments.forEach((s) => expect(s.to).toBeGreaterThan(s.from));
    p.segments.forEach((s) => expect(Number.isFinite(s.ms) && s.ms > 0).toBe(true));
  });
});

describe('film (review focus 5)', () => {
  const days = Array.from({ length: 7 }, (_, i) => dayFrom(i + 1, cdmx.map((s) => ({ ...s, id: `${s.id}${i}`, lat: s.lat + i * 0.001 }))));
  it('fits a 7-day trip in the budget', () => {
    expect(directFlyover(days, { long: true, film: true }).totalMs).toBeLessThanOrEqual(54_000);
  });
  it('a 14-day trip still ends, with finite timing', () => {
    const r = directFlyover([...days, ...days.map((d, i) => ({ ...d, dayId: `x${i}`, dayNumber: i + 8 }))], { long: true, film: true });
    expect(Number.isFinite(r.totalMs)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/flyoverDirector.test.ts`
  - Expected: FAIL (`pickFeatures` / `directFlyover` are not exported).

- [ ] **Step 3: Implement the planner.** Append to `utils/flyoverDirector.ts`:

```ts
import { momentStop, stripDayPrefix } from '@/utils/highlights';
import { travelLabel } from '@/utils/playback';
import type { Travel } from '@/utils/tripRoutes';
import { FILM_BUDGET_MS } from '@/utils/flyover';

export type DirectorStop = { id: string; name: string; type: string; lat: number; lng: number; photoCount: number };
export type DirectorDay = {
  dayId: string; dayNumber: number; label: string | null; city: string | null; stops: DirectorStop[];
  path: { coordinates: [number, number][]; stopFractions: number[]; meters: number; legs: { travel: string; startFraction: number; endFraction: number; meters: number }[] };
};
export type DayPlan = {
  dayId: string;
  establish: { camera: Camera; overviewMs: number; descendMs: number; bounds: { ne: [number, number]; sw: [number, number] } | null };
  transfer: { camera: Camera; ms: number; label: string } | null;
  introMs: number; features: number[]; featureMs: Record<number, number>; dwells: number[];
  segments: Segment[]; profile: { to: number; ms: number }[]; glideMs: number;
  cards: { eyebrow: string; titles: string[] };
};

const TRANSFER_M = 25_000;
const FEATURE_ZOOM = 15.5, FEATURE_PITCH = 60;
const walkish = (t: string) => t === 'walk';
const legZoomFor = (t: string) => (walkish(t) ? 15 : t === 'drive' || t === 'bus' ? 13.5 : 12);
const windowFor = (t: string) => (walkish(t) ? 600 : 2000);

export function dayEyebrow(dayNumber: number, label: string | null, city: string | null): string {
  const place = stripDayPrefix(label) ?? city;
  return place ? `DAY ${dayNumber} · ${place.toUpperCase()}` : `DAY ${dayNumber}`;
}

export function pickFeatures(stops: DirectorStop[], long: boolean): number[] {
  if (!long) return stops.map((_, i) => i);
  const centre = momentStop(stops.map((s) => ({ ...s, dayId: '', activityId: s.id })) as never) as unknown as DirectorStop | null;
  const rank = (s: DirectorStop) => (s.photoCount > 0 ? 0 : s.type === 'activity' ? 1 : s === centre || s.id === centre?.id ? 2 : 3);
  return stops.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).slice(0, 3).map((x) => x.i).sort((a, b) => a - b);
}

function featureHoldMs(photos: number, o: { long: boolean; film: boolean }): number {
  if (o.film) return 3000 + 1500 * Math.min(photos, 2);
  return (o.long ? 3000 : 4000) + 2000 * Math.min(photos, 4);
}

function boundsOf(coords: [number, number][]) {
  if (coords.length < 2) return null;
  const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return { ne: [Math.max(...lngs), Math.max(...lats)] as [number, number], sw: [Math.min(...lngs), Math.min(...lats)] as [number, number] };
}

function planDay(day: DirectorDay, prev: DirectorDay | null, o: { long: boolean; film: boolean; glideZoomMin?: number; overview?: boolean; noFeatures?: boolean }): DayPlan {
  const p = day.path;
  const first = day.stops[0];
  const glideCap = o.long ? 6000 : 8000;
  const features = o.noFeatures ? [] : pickFeatures(day.stops, o.long);
  const featureMs: Record<number, number> = {};
  for (const i of features) featureMs[i] = featureHoldMs(day.stops[i].photoCount, o);
  // Glides between consecutive features (or the day's ends); slow into each feature. Legs > 25 km are transfer arcs.
  const marks = [0, ...features.map((i) => p.stopFractions[i] ?? 0).filter((f) => f > 0 && f < 1), 1].filter((f, i, a) => i === 0 || f > a[i - 1]);
  let zoomScale = 0;
  let segments: Segment[] = [];
  const build = (dz: number) => {
    const out: Segment[] = [];
    let bearing = 0;
    for (let k = 1; k < marks.length; k++) {
      const from = marks[k - 1], to = marks[k];
      const leg = p.legs.find((l) => from >= l.startFraction - 1e-9 && from < l.endFraction) ?? p.legs[0];
      if (leg && leg.meters > TRANSFER_M) {
        const end = p.coordinates[p.coordinates.length - 1];
        out.push({ from, to, ms: Math.min(5000, 3000 + leg.meters / 50_000 * 1000), move: 'flyTo', camera: { center: end, zoom: 11, pitch: 40, bearing: 0 } });
        continue;
      }
      const zoom = Math.max(o.glideZoomMin ?? 11, legZoomFor(leg?.travel ?? 'walk') - dz);
      const g = glideSegments({ coords: p.coordinates, zoom, windowM: windowFor(leg?.travel ?? 'walk'), from, to, slowIn: k < marks.length - 1 || features.includes(day.stops.length - 1), startBearing: bearing });
      if (g.length) bearing = g[g.length - 1].camera.bearing;
      out.push(...g);
    }
    return out;
  };
  if (o.overview || p.coordinates.length < 2) {
    segments = p.coordinates.length < 2 ? [] : [{ from: 0, to: 1, ms: 1500, move: 'linearTo', camera: { center: p.coordinates[p.coordinates.length - 1], zoom: 12, pitch: 40, bearing: 0 } }];
  } else {
    // Fly higher on a long day so the glide stays calm and short (never under zoom 11).
    for (zoomScale = 0; zoomScale <= 4; zoomScale += 0.5) {
      segments = build(zoomScale);
      if (segments.filter((s) => s.move !== 'flyTo').reduce((a, s) => a + s.ms, 0) <= glideCap) break;
    }
  }
  const glideMs = segments.reduce((a, s) => a + s.ms, 0);
  const profile = segments.map((s) => ({ to: s.to, ms: s.ms }));
  const bounds = boundsOf(p.coordinates);
  const centre: [number, number] = first ? [first.lng, first.lat] : [0, 0];
  const establishMs = o.film ? 2000 : 3000;
  const establish = { camera: { center: centre, zoom: segments[0]?.camera.zoom ?? FEATURE_ZOOM, pitch: segments[0]?.camera.pitch ?? 45, bearing: segments[0]?.camera.bearing ?? 0 }, overviewMs: Math.round(establishMs * 0.6), descendMs: Math.round(establishMs * 0.4), bounds };
  let transfer: DayPlan['transfer'] = null;
  const prevLast = prev?.stops[prev.stops.length - 1];
  if (prevLast && first) {
    const m = haversineMeters(prevLast, first);
    if (m > TRANSFER_M) {
      const travel: Travel = m > 400_000 ? 'flight' : 'drive';
      transfer = { camera: { center: centre, zoom: 11, pitch: 40, bearing: 0 }, ms: Math.round(Math.min(5000, 3000 + (m / 200_000) * 1000)), label: travelLabel(travel, first.name) };
    }
  }
  const stop0Feature = features.includes(0) ? featureMs[0] : 0;
  const introMs = (transfer?.ms ?? 0) + establishMs + stop0Feature;
  const dwells = day.stops.map((_, i) => (i > 0 && features.includes(i) ? featureMs[i] : 0));
  return {
    dayId: day.dayId, establish, transfer, introMs, features, featureMs, dwells, segments, profile, glideMs,
    cards: { eyebrow: dayEyebrow(day.dayNumber, day.label, day.city), titles: day.stops.map((s) => s.name) },
  };
}

export function directFlyover(days: DirectorDay[], o: { long: boolean; film: boolean; budgetMs?: number }): { days: DayPlan[]; totalMs: number } {
  const total = (plans: DayPlan[]) => plans.reduce((a, d) => a + d.introMs + d.glideMs + d.dwells.reduce((x, y) => x + y, 0), 0);
  const run = (extra: { glideZoomMin?: number; overview?: boolean; noFeatures?: boolean; photoFeaturesOnly?: boolean }) => days.map((d, i) => {
    const day = extra.photoFeaturesOnly ? { ...d, stops: d.stops } : d;
    const plan = planDay(day, days[i - 1] ?? null, { ...o, ...extra });
    if (extra.photoFeaturesOnly) {
      plan.features = plan.features.filter((k) => d.stops[k].photoCount > 0);
      plan.dwells = plan.dwells.map((ms, k) => (plan.features.includes(k) ? ms : 0));
      plan.introMs -= plan.features.includes(0) ? 0 : (plan.featureMs[0] ?? 0) * (plan.introMs > 0 && plan.featureMs[0] && !plan.features.includes(0) ? 1 : 0);
    }
    return plan;
  });
  if (!o.film) { const plans = run({}); return { days: plans, totalMs: total(plans) }; }
  const budget = o.budgetMs ?? FILM_BUDGET_MS;
  for (const step of [{}, { photoFeaturesOnly: true }, { photoFeaturesOnly: true, overview: true }, { overview: true, noFeatures: true }]) {
    const plans = run(step);
    if (total(plans) <= budget || (step as { noFeatures?: boolean }).noFeatures) return { days: plans, totalMs: total(plans) };
  }
  const plans = run({ overview: true, noFeatures: true });
  return { days: plans, totalMs: total(plans) };
}
```

  The `photoFeaturesOnly` intro adjustment above is convoluted. Simplify it while making the tests pass: pass `photoFeaturesOnly` into `planDay` and filter `features` there before computing `featureMs`, `introMs` and `dwells`. Record a ruling if the code differs from this listing.

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/utils/flyoverDirector.test.ts`
  - Expected: PASS. Fix the code rather than the limits. If "establish + glides 5–11 s" fails low on a tiny day, raise that day's glide to the 2 s minimum segment (already enforced), and assert the 5 s floor only when the day has ≥ 2 stops.

- [ ] **Step 5: Commit.**

```bash
git add utils/flyoverDirector.ts __tests__/utils/flyoverDirector.test.ts
git commit -m "feat(flyover): director day plans — features, stop-name cards, transfers, film budget"
```

---

### Task 4: `TripMapView` runs the director

**Files:**
- Modify: `components/trip/TripMapView.tsx`

**Interfaces:**
- Consumes: `directFlyover`, `segmentAt`, `DayPlan` (Tasks 2–3); `FlyoverTiming.intros/profiles` (Task 1).
- Produces: nothing exported. Playback and film both run from `directorPlan`.

- [ ] **Step 1: Turn off the separate highlights player.** Replace `const useHighlights = highlightsActive({ long: isLongTrip(days.length, tripStops.length), actualMode, playing: flying || film !== 'idle' });` with:

```ts
  // One film for every trip length (flyover director, 2026-11-11): long trips no longer switch to a separate player —
  // `isLongTrip` only caps features at 3 a day.
  const longTrip = isLongTrip(days.length, tripStops.length);
  const useHighlights = false;
```

  Leave the now-dormant highlights code compiling. Task 5 removes it.

- [ ] **Step 2: Build the director's input and plan.** After `flightPaths` / `stopFractions` (around l.463), add:

```ts
  // The director plans each flown day as a few seamless camera shots (utils/flyoverDirector, tested).
  const directorDays = useMemo<DirectorDay[]>(() => flightPaths.map((d) => {
    const meta = days.find((x) => x.id === d.dayId);
    return {
      dayId: d.dayId, dayNumber: meta?.dayNumber ?? 1, label: meta?.title ?? null, city: dayCities[d.dayId] ?? null,
      stops: d.stops.map((st) => ({ id: st.activity.id, name: st.activity.placeName || st.activity.title, type: st.activity.type, lat: st.lat, lng: st.lng, photoCount: (photosByStop[st.activity.id] ?? []).length })),
      path: { coordinates: d.path.coordinates, stopFractions: d.path.stopFractions, meters: d.path.meters, legs: d.path.legs.map((l) => ({ travel: l.travel, startFraction: l.startFraction, endFraction: l.endFraction, meters: l.meters })) },
    };
  }), [flightPaths, days, dayCities, photosByStop]);
  const directorPlan = useMemo(() => directFlyover(directorDays, { long: longTrip, film: filming }), [directorDays, longTrip, filming]);
```

  `photosByStop` is declared below `flightPaths`; place this block after `photosByStop`. `dayCities` exists in this component (`grep -n "const dayCities" components/trip/TripMapView.tsx`); if it's declared later, move this block below it.

- [ ] **Step 3: Feed the reducer.** Replace:

```ts
  const tickDurations = filming ? filmPlan.durations : durations;
  const tickTiming = filming ? filmTimingNow : highlightTiming;
```

  with:

```ts
  const tickDurations = useMemo(() => directorPlan.days.map((p, i) => (flightPaths[i]?.path.coordinates.length > 1 ? Math.max(1, p.glideMs) : 0)), [directorPlan, flightPaths]);
  const tickTiming = useMemo<FlyoverTiming>(() => ({
    introMs: DEFAULT_TIMING.introMs, dwellMs: 0, legMinMs: 0,
    intros: directorPlan.days.map((p) => p.introMs),
    dwells: directorPlan.days.map((p) => p.dwells),
    profiles: directorPlan.days.map((p) => p.profile),
  }), [directorPlan]);
```

  Keep `durations` (it feeds `canFly`) and `filmPlan` until Task 5. Neither drives the clock any more.

- [ ] **Step 4: Replace the follow camera.** Replace the whole `useEffect` that starts `// Camera: settles on each day's first stop during its hold, then follows` (the `setInterval(() => move(step), step)` effect) with a segment runner:

```ts
  // Camera: glides are a few long linearTo segments planned by the director; each is sent once, as the drawing head
  // enters it, timed to the head's own pace (the reducer reads the same profile). Resuming mid-glide resends the segment
  // under the head with its remaining time.
  const sentSegment = useRef<string>('');
  useEffect(() => {
    if (flyover.status !== 'playing' || flyover.hold > 0) return;
    const plan = directorPlan.days[flyover.dayIndex];
    if (!plan || !plan.segments.length) return;
    const k = segmentAt(plan.segments, flyover.progress);
    const key = `${flyover.dayIndex}:${k}`;
    if (sentSegment.current === key) return;
    sentSegment.current = key;
    const seg = plan.segments[k];
    const left = Math.max(300, seg.ms * Math.max(0, (seg.to - flyover.progress) / (seg.to - seg.from || 1)));
    cameraRef.current?.setCamera({
      centerCoordinate: seg.camera.center, zoomLevel: seg.camera.zoom, pitch: seg.camera.pitch, heading: seg.camera.bearing,
      animationDuration: left, animationMode: seg.move,
    });
  }, [flyover.status, flyover.dayIndex, flyover.progress, flyover.hold, directorPlan, cameraRef]);
  useEffect(() => { if (flyover.status !== 'playing') sentSegment.current = ''; }, [flyover.status]);
```

- [ ] **Step 5: Replace the arrive/circle effect.** Replace the `useEffect` beginning `// Only while resting on it — resuming mid-leg mustn't pull the camera back.` (with `arrive`, `circle`, `introShot`, `stopShot`) with:

```ts
  // Holds: a day's intro (transfer arc → establish overview → descend → a stop-0 feature) and each feature (slow in,
  // close, orbit +40°, ending at the next glide's zoom so the pull-back is seamless).
  useEffect(() => {
    if (!playingNow || flyoverRef.current.hold <= 0) return;
    const plan = directorPlan.days[flyover.dayIndex];
    if (!plan) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));
    const cam = (c: { center: [number, number]; zoom: number; pitch: number; bearing: number }, ms: number, mode: 'easeTo' | 'flyTo' | 'linearTo') =>
      cameraRef.current?.setCamera({ centerCoordinate: c.center, zoomLevel: c.zoom, pitch: c.pitch, heading: c.bearing, animationDuration: ms, animationMode: mode });
    const feature = (i: number, startMs: number) => {
      const s = flightPaths[flyover.dayIndex]?.stops[i];
      if (!s) return;
      const hold = plan.featureMs[i] ?? 0;
      const next = plan.segments.find((g) => g.from >= (flightPaths[flyover.dayIndex]?.path.stopFractions[i] ?? 0) - 1e-9);
      const base = next?.camera.bearing ?? 0;
      at(startMs, () => cam({ center: [s.lng, s.lat], zoom: 15.5, pitch: 60, bearing: base - 20 }, Math.min(1200, hold * 0.3), 'easeTo'));
      at(startMs + Math.min(1200, hold * 0.3), () => cam({ center: [s.lng, s.lat], zoom: next?.camera.zoom ?? 15, pitch: next?.camera.pitch ?? 55, bearing: base + 20 }, hold - Math.min(1200, hold * 0.3), 'easeTo'));
    };
    if (flyover.stopIndex === 0 && flyover.progress === 0) {
      let t = 0;
      if (plan.transfer) { cam(plan.transfer.camera, plan.transfer.ms, 'flyTo'); t += plan.transfer.ms; }
      const e = plan.establish;
      at(t, () => {
        if (e.bounds) cameraRef.current?.setCamera({ bounds: e.bounds, padding: { paddingTop: 140, paddingBottom: 260, paddingLeft: 40, paddingRight: 40 }, pitch: 40, heading: e.camera.bearing, animationDuration: e.overviewMs, animationMode: 'flyTo' });
        else cam({ ...e.camera, zoom: 13, pitch: 40 }, e.overviewMs, 'flyTo');
      });
      at(t + e.overviewMs, () => cam(e.camera, e.descendMs, 'easeTo'));
      if (plan.features.includes(0)) feature(0, t + e.overviewMs + e.descendMs);
    } else if (plan.features.includes(flyover.stopIndex)) {
      feature(flyover.stopIndex, 0);
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per hold start, not per tick
  }, [playingNow, flyover.dayIndex, flyover.stopIndex, filming]);
```

- [ ] **Step 6: Card text and the stop pulse.**
  - **Card text.** Where the card renders (`{hlEyebrow ?? stopEyebrow(…)}` and the title line `{hlChapter ? (hlCity ?? ' ') : flyStop ? … : ' '}`), change it to use the director:

```tsx
                  {directorPlan.days[flyover.dayIndex]?.transfer && flyover.stopIndex === 0 && flyover.hold > 0 && flyover.progress === 0
                    ? directorPlan.days[flyover.dayIndex]!.transfer!.label.toUpperCase()
                    : directorPlan.days[flyover.dayIndex]?.cards.eyebrow ?? ' '}
```

    and the title:

```tsx
                  {directorPlan.days[flyover.dayIndex]?.cards.titles[Math.max(0, flyover.stopIndex)] ?? ' '}
```

  - **Pulse.** Find where stop markers render, using `reached(` and the marker component (`grep -n "reached(" components/trip/TripMapView.tsx`). Wrap the marker view for the stop at `flyStop?.activity.id` in an `Animated.View` that runs a one-time scale 1 → 1.15 → 1 over 600 ms when that id becomes the current stop. Use `react-native-reanimated` `useSharedValue` + `withSequence(withTiming(1.15, { duration: 300 }), withTiming(1, { duration: 300 }))`, triggered in a `useEffect` on `flyStop?.activity.id`. If marker views are native `MarkerView`s that don't accept Animated children, skip the pulse and record a ruling. The card title change already marks the stop.

- [ ] **Step 7: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors; all tests pass; `0 errors`. Unused-import warnings for highlights helpers are fine until Task 5.

- [ ] **Step 8: Commit.**

```bash
git add components/trip/TripMapView.tsx
git commit -m "feat(flyover): the trip map runs the director — seamless glides, features, transfers, stop-name cards"
```

---

### Task 5: Remove the dormant paths, plus docs

**Files:**
- Modify: `components/trip/TripMapView.tsx`: remove the highlights-only code (`chapters`, `chapterSeqs`, `momentPhotos`, `highlightTiming`, `filmMomentPhotos`, `filmTimingNow`, `cityNames`, the `hl*` card values, `chapterName`) and the unused imports (`highlightsActive`, `tripChapters`, `momentEyebrow`, `dayRangeLabel`, `followStepMs`, `introShot`, `stopShot`, `arrivalCamera`, `limitTurn`, `aheadBearing`, `legZoom`, `legPitch` if unused). Use `npx tsc --noEmit -p .` and `npx expo lint` to find what's now unused.
- Modify: `CLAUDE.md`, the trip map bullets (`utils/flyover.ts`, `utils/flyoverCamera.ts`, Highlights playback, Trip video).

- [ ] **Step 1: Delete the dormant highlights wiring.** Delete `const useHighlights = false;`, then every branch that reads it (TypeScript will flag each). Keep `utils/highlights.ts` itself: `momentStop` and `stripDayPrefix` are used by the director, and its tests stay.

- [ ] **Step 2: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: clean; lint shows no new warnings compared with before Task 4 (24).

- [ ] **Step 3: Update CLAUDE.md.** Replace the **Highlights playback** bullet with a **Flyover director** bullet:

  "(spec `docs/superpowers/specs/2026-11-11-flyover-director-design.md`; pure `utils/flyoverDirector.ts`) — every trip plays as one calm film. Each day is planned as: establish (3 s; transfer `flyTo` arc first when > 25 km from the previous day, card `By train to …`), glide (2–4 s `linearTo` segments over a smoothed camera line, ≤ 35% screen width/s, heading ≤ 12°/s, zoom step ≤ 0.15, slows into features), feature (zoom 15.5, pitch 60, orbit, ending at the next glide's zoom; every stop on short trips, ≤ 3 a day on long ones — photos, sights, central — 4 s / 3 s long + 2 s a photo). The reducer stays the clock with per-day `intros` and speed `profiles` (`profileSpeed`), so head and camera share one timeline. The card title is the stop's own name; the day/city go in the eyebrow. Film: the same plan within `FILM_BUDGET_MS` (photo features only → overview glides → no features). The one-second follow camera, the arrive/circle code and the separate highlights player are gone."

  Also update the `utils/flyover.ts` and `utils/flyoverCamera.ts` bullets so they no longer describe the removed follow camera.

- [ ] **Step 4: Commit.**

```bash
git add components/trip/TripMapView.tsx CLAUDE.md
git commit -m "refactor(flyover): remove the old follow camera and highlights player; docs"
```

---

## After the tasks

- **Final review:** a fresh reviewer over `git merge-base main HEAD..HEAD`, with this plan's Review Focus.
- **Device check (owner):** a short trip, the Mexico City trip, and a multi-city trip, both playback and video. Smoothness can only be judged on a phone.
- **Ships with the next batched build.** It's app-only; there's no server deploy.
