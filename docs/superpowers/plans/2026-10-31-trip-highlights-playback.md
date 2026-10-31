# Trip Highlights Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long trips play city by city and day by day — one moment per day with up to 4 photos shown 2 s each — with how they travelled between cities, in playback and the trip video.

**Architecture:** A pure planner (`utils/highlights.ts`) turns days + grounded stops into city chapters of day moments. `TripMapView` feeds chapters to the existing flyover reducer as "days" whose "stops" are the moments (real stops, so cards, markers and the camera keep working), with per-moment dwells from `utils/flyover.ts`. The photo shown during a dwell advances every 2 s (`photoIndexAt`). Unnamed cities get one Mapbox reverse lookup per session.

**Tech Stack:** React Native, Expo, `@rnmapbox/maps`, TypeScript, Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-10-31-trip-highlights-playback-design.md`

## Global Constraints

- Highlights when `dayCount >= 5 || stopCount >= 26`; otherwise today's code path, unchanged.
- Chapter = consecutive days in one city; a different city between starts a new chapter.
- Moment photos: up to `HIGHLIGHT_PHOTOS_MAX = 4`, each `HIGHLIGHT_PHOTO_MS = 2000`, after `HIGHLIGHT_ARRIVE_MS = 1500`; no photos → `HIGHLIGHT_EMPTY_HOLD_MS = 1500`.
- Video ≤ `FILM_BUDGET_MS` (54 s); never shows a photo for less than 2 s; drops photos from the day with the most first (ties: later day).
- Photos only on trips the viewer is on (`canEdit`), as today.
- City clustering radius 50 km. City name: saved (`dayCities`) → most common trailing `searchQuery` segment → one Mapbox reverse lookup (types `place`), session cache, 2 s timeout, failure → no city.
- Travel between chapters via existing `legTravel` + `arriveBy` hints; never `walk`. Labels via existing `utils/playback.ts travelLabel` ("By train to Osaka").
- No new persisted data; no new Directions calls beyond one routed leg per driven city change.
- Copy: sentence case, eyebrows uppercase; no emoji.

## Review Focus

1. A trip whose stops are mostly ungrounded (no lat/lng) — days without grounded stops take a neighbouring day's city and still get a moment only if they have a grounded stop; playback must not crash or show an empty chapter. Test: `tripChapters` with a day of zero grounded stops.
2. A one-city long trip (tester's 8-day Tokyo) — one chapter, 8 moments, no arrival leg. Test in Task 1.
3. Returning to a previous city (Tokyo → Osaka → Tokyo) — three chapters, the third arrives from Osaka. Test in Task 1.
4. A trip that crosses the antimeridian or a long flight — arrival travel is `flight` and drawn as an arc (existing `buildPath`). Test: `arrivalTravel` for > 400 km.
5. Highlights with Actual mode (visited stops) — highlights apply to the Planned view only; Actual mode keeps today's path. Test: `useHighlights` decision `highlightsActive({ long, actualMode })`.

---

### Task 1: The planner

**Files:**
- Create: `utils/highlights.ts`
- Test: `__tests__/utils/highlights.test.ts`

**Interfaces:**
- Consumes: `haversineMeters`, `legTravel`, `type Travel`, `type RouteStop` from `@/utils/tripRoutes`.
- Produces:
  ```ts
  export const HIGHLIGHT_MIN_DAYS = 5; export const HIGHLIGHT_MIN_STOPS = 26; export const CITY_RADIUS_M = 50_000;
  export function isLongTrip(dayCount: number, stopCount: number): boolean;
  export function highlightsActive(i: { long: boolean; actualMode: boolean }): boolean;
  export interface HStop { id: string; dayId: string; lat: number; lng: number; searchQuery: string | null; route: RouteStop }
  export interface HDay { id: string; dayNumber: number; title: string | null; savedCity: string | null }
  export interface Moment { dayId: string; dayNumber: number; label: string | null; stopId: string }
  export interface Chapter { cityName: string | null; center: { lat: number; lng: number }; dayNumbers: number[]; moments: Moment[]; arrival: { travel: Travel; fromStopId: string } | null }
  export function stripDayPrefix(title: string | null): string | null;
  export function cityFromQueries(queries: (string | null)[]): string | null;
  export function momentStop(stops: HStop[]): HStop | null;
  export function arrivalTravel(from: RouteStop, to: RouteStop): Travel;
  export function tripChapters(days: HDay[], stops: HStop[]): Chapter[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import {
  isLongTrip, highlightsActive, stripDayPrefix, cityFromQueries, momentStop, arrivalTravel, tripChapters,
  type HStop, type HDay,
} from '@/utils/highlights';

const TOKYO = { lat: 35.68, lng: 139.76 };
const OSAKA = { lat: 34.69, lng: 135.50 };
let n = 0;
const stop = (dayId: string, at: { lat: number; lng: number }, q: string | null = null, type = 'activity', title = 'Stop'): HStop => {
  const id = `s${n++}`;
  return { id, dayId, lat: at.lat, lng: at.lng, searchQuery: q, route: { id, type: type as never, title, notes: '', lat: at.lat, lng: at.lng } };
};
const near = (p: { lat: number; lng: number }, d: number) => ({ lat: p.lat + d, lng: p.lng + d });
const day = (id: string, dayNumber: number, title: string | null = null, savedCity: string | null = null): HDay => ({ id, dayNumber, title, savedCity });

describe('isLongTrip / highlightsActive', () => {
  it('5+ days or 26+ stops', () => {
    expect(isLongTrip(4, 25)).toBe(false);
    expect(isLongTrip(5, 3)).toBe(true);
    expect(isLongTrip(2, 26)).toBe(true);
  });
  it('planned view only', () => {
    expect(highlightsActive({ long: true, actualMode: false })).toBe(true);
    expect(highlightsActive({ long: true, actualMode: true })).toBe(false);
    expect(highlightsActive({ long: false, actualMode: false })).toBe(false);
  });
});

describe('labels and names', () => {
  it('strips Day N prefixes', () => {
    expect(stripDayPrefix('Day 2: Shibuya & Harajuku')).toBe('Shibuya & Harajuku');
    expect(stripDayPrefix('Day 3 – Asakusa')).toBe('Asakusa');
    expect(stripDayPrefix('Day 4')).toBeNull();
    expect(stripDayPrefix('Arrival')).toBe('Arrival');
    expect(stripDayPrefix(null)).toBeNull();
  });
  it('names a city from the stops\' search text', () => {
    expect(cityFromQueries(['Senso-ji, Tokyo', 'Ueno Park, Tokyo', 'Kyoto Station, Kyoto', null])).toBe('Tokyo');
    expect(cityFromQueries(['Somewhere, JP', 'Shop 12, 100-0001'])).toBeNull();
    expect(cityFromQueries([null, 'no comma'])).toBeNull();
  });
});

describe('momentStop / arrivalTravel', () => {
  it('picks the stop nearest the middle of the day', () => {
    const a = stop('d', near(TOKYO, 0)), b = stop('d', near(TOKYO, 0.01)), c = stop('d', near(TOKYO, 0.2));
    expect(momentStop([a, b, c])!.id).toBe(b.id);
    expect(momentStop([])).toBeNull();
  });
  it('never walks between cities; long hops fly', () => {
    const a = stop('d1', TOKYO).route, b = stop('d2', near(TOKYO, 0.005)).route;
    expect(arrivalTravel(a, b)).toBe('drive');
    expect(arrivalTravel(stop('x', TOKYO).route, stop('y', { lat: 13.75, lng: 100.5 }).route)).toBe('flight');
    expect(arrivalTravel(stop('x', TOKYO).route, stop('y', OSAKA, null, 'transport', 'Shinkansen train to Osaka').route)).toBe('train');
  });
});

describe('tripChapters', () => {
  it('one city over 8 days: one chapter, 8 moments, no arrival', () => {
    const days = Array.from({ length: 8 }, (_, i) => day(`d${i + 1}`, i + 1, `Day ${i + 1}: Area ${i + 1}`));
    const stops = days.flatMap((d, i) => [stop(d.id, near(TOKYO, i * 0.01), 'Spot, Tokyo'), stop(d.id, near(TOKYO, i * 0.01 + 0.005), 'Spot, Tokyo')]);
    const ch = tripChapters(days, stops);
    expect(ch).toHaveLength(1);
    expect(ch[0].cityName).toBe('Tokyo');
    expect(ch[0].dayNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ch[0].moments.map((m) => m.label)).toEqual(['Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area 5', 'Area 6', 'Area 7', 'Area 8']);
    expect(ch[0].arrival).toBeNull();
  });
  it('Tokyo → Osaka → Tokyo is three chapters with arrivals', () => {
    const days = [day('a', 1), day('b', 2), day('c', 3)];
    const s = [stop('a', TOKYO, 'X, Tokyo'), stop('b', OSAKA, 'Y, Osaka'), stop('c', near(TOKYO, 0.01), 'Z, Tokyo')];
    const ch = tripChapters(days, s);
    expect(ch.map((c) => c.cityName)).toEqual(['Tokyo', 'Osaka', 'Tokyo']);
    expect(ch[1].arrival).toEqual({ travel: 'drive', fromStopId: s[0].id });
    expect(ch[2].arrival?.fromStopId).toBe(s[1].id);
  });
  it('uses saved cities when the trip has them', () => {
    const days = [day('a', 1, null, 'Lisbon'), day('b', 2, null, 'Lisbon'), day('c', 3, null, 'Porto')];
    const s = [stop('a', { lat: 38.72, lng: -9.14 }), stop('b', { lat: 38.8, lng: -9.38 }), stop('c', { lat: 41.15, lng: -8.61 })];
    const ch = tripChapters(days, s);
    expect(ch.map((c) => [c.cityName, c.dayNumbers])).toEqual([['Lisbon', [1, 2]], ['Porto', [3]]]);
  });
  it('a day with no located stops joins the city around it and has no moment', () => {
    const days = [day('a', 1), day('b', 2), day('c', 3)];
    const s = [stop('a', TOKYO, 'X, Tokyo'), stop('c', near(TOKYO, 0.01), 'Z, Tokyo')];
    const ch = tripChapters(days, s);
    expect(ch).toHaveLength(1);
    expect(ch[0].dayNumbers).toEqual([1, 2, 3]);
    expect(ch[0].moments.map((m) => m.dayNumber)).toEqual([1, 3]);
  });
  it('plans a 30-day, 200-stop trip quickly', () => {
    const days = Array.from({ length: 30 }, (_, i) => day(`d${i}`, i + 1));
    const stops = Array.from({ length: 200 }, (_, i) => stop(`d${i % 30}`, near(i % 60 < 30 ? TOKYO : OSAKA, (i % 7) * 0.01), 'Spot, City'));
    const t = Date.now();
    tripChapters(days, stops);
    expect(Date.now() - t).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/utils/highlights.test.ts --watchAll=false`
Expected: FAIL — cannot find module `@/utils/highlights`.

- [ ] **Step 3: Implement `utils/highlights.ts`**

```ts
/**
 * Playback highlights for long trips (spec 2026-10-31-trip-highlights-playback-design.md): a chapter per city
 * (consecutive days in one city), one moment per day at a real stop near the middle of that day, and how the
 * traveler got from one city to the next. Pure.
 */
import { haversineMeters, legTravel, type RouteStop, type Travel } from '@/utils/tripRoutes';

export const HIGHLIGHT_MIN_DAYS = 5;
export const HIGHLIGHT_MIN_STOPS = 26;
export const CITY_RADIUS_M = 50_000;

export const isLongTrip = (dayCount: number, stopCount: number) => dayCount >= HIGHLIGHT_MIN_DAYS || stopCount >= HIGHLIGHT_MIN_STOPS;
/** Highlights are the Planned view; Actual mode keeps the visited route as it is. */
export const highlightsActive = (i: { long: boolean; actualMode: boolean }) => i.long && !i.actualMode;

export interface HStop { id: string; dayId: string; lat: number; lng: number; searchQuery: string | null; route: RouteStop }
export interface HDay { id: string; dayNumber: number; title: string | null; savedCity: string | null }
export interface Moment { dayId: string; dayNumber: number; label: string | null; stopId: string }
export interface Chapter {
  cityName: string | null;
  center: { lat: number; lng: number };
  dayNumbers: number[];
  moments: Moment[];
  arrival: { travel: Travel; fromStopId: string } | null;
}

export function stripDayPrefix(title: string | null): string | null {
  if (!title) return null;
  const t = title.replace(/^\s*day\s*\d+\s*[:\-–—·.]?\s*/i, '').trim();
  return t || null;
}

/** The most common last part of the stops' search text ("Senso-ji, Tokyo" → Tokyo), ignoring codes and numbers. */
export function cityFromQueries(queries: (string | null)[]): string | null {
  const count = new Map<string, number>();
  for (const q of queries) {
    if (!q || !q.includes(',')) continue;
    const last = q.split(',').pop()!.trim();
    if (!last || /\d/.test(last) || /^[A-Z]{2,3}$/.test(last)) continue;
    count.set(last, (count.get(last) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  for (const [k, v] of count) if (v > n) { best = k; n = v; }
  return best;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const middle = (stops: { lat: number; lng: number }[]) => ({ lat: median(stops.map((s) => s.lat)), lng: median(stops.map((s) => s.lng)) });

export function momentStop(stops: HStop[]): HStop | null {
  if (stops.length === 0) return null;
  const mid = middle(stops);
  let best = stops[0], d = Infinity;
  for (const s of stops) { const x = haversineMeters(s, mid); if (x < d) { d = x; best = s; } }
  return best;
}

export function arrivalTravel(from: RouteStop, to: RouteStop): Travel {
  const t = legTravel(from, to);
  return t === 'walk' ? 'drive' : t;
}

export function tripChapters(days: HDay[], stops: HStop[]): Chapter[] {
  const byDay = new Map<string, HStop[]>();
  for (const s of stops) byDay.set(s.dayId, [...(byDay.get(s.dayId) ?? []), s]);
  const ordered = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  // A city key per day: the saved city, else the nearest cluster within 50 km.
  const clusters: { lat: number; lng: number }[] = [];
  const keys: (string | null)[] = ordered.map((d) => {
    if (d.savedCity) return `saved:${d.savedCity}`;
    const own = byDay.get(d.id) ?? [];
    if (own.length === 0) return null;
    const at = middle(own);
    let best = -1, bestD = Infinity;
    clusters.forEach((c, i) => { const x = haversineMeters(c, at); if (x < bestD) { bestD = x; best = i; } });
    if (best >= 0 && bestD <= CITY_RADIUS_M) return `c:${best}`;
    clusters.push(at);
    return `c:${clusters.length - 1}`;
  });
  // Days without located stops take the previous day's city (the first ones, the next known one).
  for (let i = 0; i < keys.length; i++) if (keys[i] === null && i > 0) keys[i] = keys[i - 1];
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i] === null && i < keys.length - 1) keys[i] = keys[i + 1];

  const chapters: (Chapter & { key: string | null; stops: HStop[] })[] = [];
  ordered.forEach((d, i) => {
    const last = chapters[chapters.length - 1];
    const own = byDay.get(d.id) ?? [];
    const target = last && last.key === keys[i] ? last : null;
    const ch = target ?? (() => {
      const c = { key: keys[i], cityName: d.savedCity, center: { lat: 0, lng: 0 }, dayNumbers: [], moments: [], arrival: null, stops: [] } as Chapter & { key: string | null; stops: HStop[] };
      chapters.push(c);
      return c;
    })();
    ch.dayNumbers.push(d.dayNumber);
    ch.stops.push(...own);
    const m = momentStop(own);
    if (m) ch.moments.push({ dayId: d.id, dayNumber: d.dayNumber, label: stripDayPrefix(d.title), stopId: m.id });
  });

  const stopById = new Map(stops.map((s) => [s.id, s]));
  return chapters.filter((c) => c.moments.length > 0).map((c, i, all) => {
    const { key: _key, stops: own, ...rest } = c;
    const prev = all[i - 1];
    const fromId = prev ? prev.moments[prev.moments.length - 1].stopId : null;
    const toStop = stopById.get(c.moments[0].stopId)!;
    return {
      ...rest,
      cityName: rest.cityName ?? cityFromQueries(own.map((s) => s.searchQuery)),
      center: own.length ? middle(own) : { lat: toStop.lat, lng: toStop.lng },
      arrival: fromId ? { travel: arrivalTravel(stopById.get(fromId)!.route, toStop.route), fromStopId: fromId } : null,
    };
  });
}
```

Note on the moment label: when `stripDayPrefix` returns null the player shows the city name (Task 3), so the planner keeps `null` rather than guessing.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/utils/highlights.test.ts --watchAll=false`
Expected: PASS. If `arrivalTravel(Tokyo→Osaka with a "Shinkansen train" transport stop)` returns something else, check `RAIL` in `utils/tripRoutes.ts` matches "train" — it does today; do not change `legTravel`.

- [ ] **Step 5: Commit**

```bash
git add utils/highlights.ts __tests__/utils/highlights.test.ts
git commit -m "feat(playback): plan long trips as city chapters of day moments"
```

---

### Task 2: Moment timing and the video budget

**Files:**
- Modify: `utils/flyover.ts` (append)
- Test: `__tests__/utils/flyoverHighlights.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const HIGHLIGHT_PHOTO_MS = 2000; export const HIGHLIGHT_PHOTOS_MAX = 4;
  export const HIGHLIGHT_ARRIVE_MS = 1500; export const HIGHLIGHT_EMPTY_HOLD_MS = 1500;
  export function momentHoldMs(photoCount: number): number;
  export function photoIndexAt(holdTotalMs: number, holdLeftMs: number, photoCount: number): number | null;
  export function highlightFilmPhotos(photoCounts: number[][], budgetMs: number, fixedMs: number): number[][];
  ```
  `photoCounts[chapter][moment]` = photos available (already capped at 4). `fixedMs` = everything that isn't a photo (openings, routes, arrive/empty holds). Returns photos to show per moment.

- [ ] **Step 1: Write the failing tests**

```ts
import { momentHoldMs, photoIndexAt, highlightFilmPhotos, HIGHLIGHT_PHOTO_MS } from '@/utils/flyover';

describe('momentHoldMs', () => {
  it('arrive + 2 s a photo, or a short hold without photos', () => {
    expect(momentHoldMs(0)).toBe(1500);
    expect(momentHoldMs(1)).toBe(3500);
    expect(momentHoldMs(4)).toBe(9500);
    expect(momentHoldMs(9)).toBe(9500); // capped at 4
  });
});

describe('photoIndexAt', () => {
  it('no photo while the camera arrives, then one every 2 s', () => {
    const total = momentHoldMs(3);
    expect(photoIndexAt(total, total, 3)).toBeNull();
    expect(photoIndexAt(total, total - 1600, 3)).toBe(0);
    expect(photoIndexAt(total, total - 3600, 3)).toBe(1);
    expect(photoIndexAt(total, 10, 3)).toBe(2);
    expect(photoIndexAt(1500, 100, 0)).toBeNull();
  });
});

describe('highlightFilmPhotos', () => {
  it('keeps every photo when it fits', () => {
    expect(highlightFilmPhotos([[2, 1], [3]], 54000, 20000)).toEqual([[2, 1], [3]]);
  });
  it('drops from the busiest day first (ties: the later day), never below 2 s a photo', () => {
    // 6 photos = 12 s; room for 8 s → 4 photos.
    const out = highlightFilmPhotos([[3, 1], [2]], 28000, 20000);
    expect(out.flat().reduce((a, b) => a + b, 0) * HIGHLIGHT_PHOTO_MS).toBeLessThanOrEqual(8000);
    expect(out).toEqual([[2, 1], [1]]);
  });
  it('shows none when there is no room', () => {
    expect(highlightFilmPhotos([[4]], 10000, 12000)).toEqual([[0]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/utils/flyoverHighlights.test.ts --watchAll=false`
Expected: FAIL — `momentHoldMs` is not a function.

- [ ] **Step 3: Append to `utils/flyover.ts`**

```ts
/**
 * Highlights (spec 2026-10-31): each day's moment lets the camera arrive, then shows its photos one after another
 * for 2 s each — long enough to see (owner) — up to 4. A day without photos passes quickly.
 */
export const HIGHLIGHT_PHOTO_MS = 2000;
export const HIGHLIGHT_PHOTOS_MAX = 4;
export const HIGHLIGHT_ARRIVE_MS = 1500;
export const HIGHLIGHT_EMPTY_HOLD_MS = 1500;

export function momentHoldMs(photoCount: number): number {
  const n = Math.min(Math.max(0, photoCount), HIGHLIGHT_PHOTOS_MAX);
  return n === 0 ? HIGHLIGHT_EMPTY_HOLD_MS : HIGHLIGHT_ARRIVE_MS + n * HIGHLIGHT_PHOTO_MS;
}

/** Which photo shows during a moment's hold, or null while the camera arrives (or with none). */
export function photoIndexAt(holdTotalMs: number, holdLeftMs: number, photoCount: number): number | null {
  if (photoCount <= 0) return null;
  const elapsed = holdTotalMs - holdLeftMs - HIGHLIGHT_ARRIVE_MS;
  if (elapsed < 0) return null;
  return Math.min(photoCount - 1, Math.floor(elapsed / HIGHLIGHT_PHOTO_MS));
}

/** The video's photos per moment within the budget: photos keep 2 s; the busiest day (then the later one) gives one up first. */
export function highlightFilmPhotos(photoCounts: number[][], budgetMs: number, fixedMs: number): number[][] {
  const out = photoCounts.map((ch) => ch.map((n) => Math.min(Math.max(0, n), HIGHLIGHT_PHOTOS_MAX)));
  const room = () => budgetMs - fixedMs - out.flat().reduce((a, b) => a + b, 0) * HIGHLIGHT_PHOTO_MS;
  while (room() < 0) {
    let bc = -1, bm = -1, most = 0;
    out.forEach((ch, c) => ch.forEach((n, m) => { if (n > 0 && n >= most) { most = n; bc = c; bm = m; } }));
    if (bc < 0) break;
    out[bc][bm] -= 1;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/utils/flyoverHighlights.test.ts --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/flyover.ts __tests__/utils/flyoverHighlights.test.ts
git commit -m "feat(playback): highlight moments hold for their photos, 2 s each; video fits by dropping photos"
```

---

### Task 3: Playing highlights in TripMapView

**Files:**
- Modify: `components/trip/TripMapView.tsx`
- Modify: `services/places/mapboxSearch.ts` (add `cityNameAt`)
- Modify: `components/trip/FilmOverlay.tsx` only if its photo prop needs a key for re-animation (check)
- Test: tsc + full suite; device test

**Interfaces:**
- Consumes: Task 1 (`isLongTrip`, `highlightsActive`, `tripChapters`, `HStop`, `HDay`, `Chapter`), Task 2 (`momentHoldMs`, `photoIndexAt`, `highlightFilmPhotos`, `HIGHLIGHT_PHOTOS_MAX`), existing `buildPath`, `toRouteStop`, `travelLabel`, `dayDurationMs`, `filmTiming`, `stopEyebrow`, `photosByStop`.
- Produces: `cityNameAt(lat: number, lng: number): Promise<string | null>` in `services/places/mapboxSearch.ts`.

Implementation (in this order; read surrounding code before each edit):

- [ ] **Step 1: `cityNameAt`** in `services/places/mapboxSearch.ts`:

```ts
/** The city a point is in (Geocoding v6 reverse, types place) — names a highlights chapter that has no saved city. */
export async function cityNameAt(lat: number, lng: number): Promise<string | null> {
  if (!TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place&limit=1&access_token=${TOKEN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const f = ((await res.json()) as { features?: { properties?: { name?: string } }[] }).features?.[0];
    return f?.properties?.name ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Chapters** — after `stopsByDay`/`tripStops`, compute:

```ts
const long = isLongTrip(days.length, tripStops.length);
const useHighlights = highlightsActive({ long, actualMode });
const chapters = useMemo(() => (useHighlights ? tripChapters(
  days.map((d) => ({ id: d.id, dayNumber: d.dayNumber, title: d.title ?? null, savedCity: dayCities[d.id] ?? null })),
  tripStops.map((st, i) => ({ id: st.activity.id, dayId: st.dayId, lat: st.lat, lng: st.lng, searchQuery: st.activity.searchQuery ?? null,
    route: toRouteStop(st, i > 0 && st.stopNumber === 1 ? hints[st.dayId] : undefined) })),
) : []), [useHighlights, days, dayCities, tripStops, hints]);
```

(`actualMode` is declared below `dayPaths` today — move the `mapMode`/`showModeSwitch`/`actualMode` lines above this block.)

- [ ] **Step 3: Names** — `const [cityNames, setCityNames] = useState<Record<number, string>>({});` and an effect that, when `flying || film !== 'idle'`, for each chapter with `cityName === null` not yet in `cityNames`, calls `cityNameAt(center.lat, center.lng)` once and stores the result (session-only). `chapterName = (i) => chapters[i]?.cityName ?? cityNames[i] ?? null`.

- [ ] **Step 4: Flight paths** — when `useHighlights`, `flightPaths` becomes one entry per chapter:

```ts
const stopById = new Map(tripStops.map((s) => [s.activity.id, s]));
chapters.map((c, i) => {
  const moments = c.moments.map((m) => stopById.get(m.stopId)!).filter(Boolean);
  const from = c.arrival ? stopById.get(c.arrival.fromStopId) : undefined;
  const seq = from ? [from, ...moments] : moments;
  const routeStops = seq.map((st, k) => ({ ...toRouteStop(st, k === 1 && c.arrival ? c.arrival.travel : undefined),
    // Moments inside a city are linked straight (no per-stop road calls).
    ...(k > 1 || (k === 1 && !from) ? { arriveBy: 'bus' as const } : {}) }));
  return { dayId: `chapter-${i}`, color: palette.days[i % palette.days.length], stops: seq, path: buildPath(routeStops, cache) };
});
```

Use a travel that buildPath draws as a straight arc for in-city links — check `legMode`: only walk/drive are routed, so `arriveBy: 'bus'` with ≥ 2.5 km draws straight; under 2.5 km `legTravel` returns `walk` regardless of `arriveBy`, which routes a short walk — acceptable (cached, short) but add those legs to `allMissing` only via `buildPath(...).missing` of the chapter paths so they're fetched like any leg. Add the chapter paths' `.missing` to `allMissing` when `useHighlights`. Record a Ruling if a cleaner in-city straight-line option is used.

- [ ] **Step 5: Dwells** — per chapter, per stop in `seq`: arrival origin `0`; each moment `momentHoldMs(photosFor(moment))` where `photosFor` = the day's photos: `(dayStopIds) => dayStopIds.flatMap((id) => photosByStop[id] ?? []).slice(0, HIGHLIGHT_PHOTOS_MAX)` when `canEdit`, else `[]`. Build `highlightTiming: FlyoverTiming = { ...DEFAULT_TIMING, dwells }` and pass it as `tickTiming` (and to `play`/`jump`) when `useHighlights && !filming`.
- [ ] **Step 6: Video** — when `useHighlights && filming`: `fixedMs` = openings (introMs per chapter) + route durations + per-moment arrive/empty holds + `FILM_OPENING_MS + FILM_END_MS`; `photos = highlightFilmPhotos(counts, FILM_BUDGET_MS + FILM_OPENING_MS + FILM_END_MS, fixedMs)`; dwells from `momentHoldMs(photos[c][m])`; durations from `filmTiming(durations, stopCounts, []).durations` (route squeeze only). Keep the existing non-highlight film path unchanged.
- [ ] **Step 7: Captions and photos**
  - Opening eyebrow while `flyover.stopIndex === 0 && hold > 0` on a chapter: `${(chapterName(i) ?? '').toUpperCase()} · ${dayRangeLabel(c.dayNumbers)}` where `dayRangeLabel([1,2,3,4])` = `DAYS 1–4`, `[5]` = `DAY 5` (add as a small pure helper in `utils/highlights.ts` with a test).
  - During the arrival leg: the existing `legLine` already reads `travelLabel(travel, to)`; for highlights pass `chapterName(i) ?? to.activity.placeName` as the destination.
  - At a moment: card eyebrow `DAY {n} · {(label ?? chapterName ?? '').toUpperCase()}`; photo = `photos[photoIndexAt(holdTotal, flyover.hold, count)]` (hold total from the dwell table). Same for `FilmOverlay`'s photo/caption props when filming. Key the photo element by its url so each change springs in.
- [ ] **Step 8: Short trips** — verify the non-highlight path is byte-for-byte the old one (diff review), then:

Run: `npx tsc --noEmit -p . && npx jest --watchAll=false`
Expected: clean; suite passes.

- [ ] **Step 9: Commit**

```bash
git add components/trip/TripMapView.tsx services/places/mapboxSearch.ts utils/highlights.ts __tests__/utils/highlights.test.ts
git commit -m "feat(playback): long trips play city by city with each day's photos"
```

---

### Task 4: Docs

**Files:** `CLAUDE.md` (bullet under Utils near `utils/flyover.ts`)

- [ ] **Step 1:** Add: **Highlights playback** (spec, `utils/highlights.ts`, constants, threshold, chapters/moments, photo timing, video budget rule, Planned only, `cityNameAt` session lookups).
- [ ] **Step 2:** `npx jest --watchAll=false` → pass; commit `docs(playback): highlights playback in CLAUDE.md`.
