# Year in Travel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, shareable "Your 2026 in travel" story of full-screen slides, opened from Home (Dec 1 – Jan 15) and Profile.

**Architecture:** A callable `yearInTravel` computes a cached `YearSummary` from the caller's trips with pure, tested rules (`functions/src/yearInTravel.ts`). The app renders slides from it (`app/year/[year].tsx`, `components/yearInTravel/`), with pure story/copy rules in `utils/yearInTravel.ts` and map math in `utils/yearMap.ts` over a committed dot-matrix world (`assets/yearInTravel/worldDots.json`). Slides are shared as 1080 × 1920 images with `react-native-view-shot` + `expo-sharing`.

**Tech Stack:** Firebase Functions v2, Firestore Admin, Expo Router, React Native, `react-native-svg`, `react-native-view-shot` (new), `expo-sharing`, TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-11-01-year-in-travel-design.md`

## Global Constraints

- Free for everyone; eligible = ≥ 1 trip that took place in the year (own, joined, past-from-photos); undated trips excluded.
- Home card window: Dec 1 – Jan 15 (Jan 1–15 celebrates the previous year). Profile row whenever the summary has trips ≥ 1.
- ~6 s per slide; tap right/left next/prev, hold pauses, swipe down closes. Always dark (splash palette + star gradient).
- Photos only those the caller took (journal entries on trips they authored + their own place reviews), ≤ 6. Companions ≤ 8, blocked excluded, never on a share image.
- Share images 1080 × 1920 with the star + "supernovatravel.xyz", no app controls.
- Cache `users/{uid}/private/yearInTravel_{year}` (owner-read, server-written); recompute when > 24 h old or a counted trip's `updatedAt` is newer.
- Reduce Motion: no count-up, no arc animation. No emoji. Sentence case. 44 pt targets.

## Review Focus

1. A trip spanning New Year (Dec 28 – Jan 3) — counted in both years with days clipped (4 in 2026, 3 in 2027). Test in Task 1.
2. Two overlapping trips (e.g. a joined trip inside your own) — days away counted once per calendar day. Test in Task 1.
3. A trip with no located stops / no dates on days — km 0 for it, no crash, still counts cities and days. Test in Task 1.
4. An arc between Tokyo and Los Angeles — crosses the antimeridian the short way, not across the whole map. Test in Task 3.
5. A summary with 1 trip, 0 photos, 0 companions — photos and companions slides hidden; copy reads "1 trip", "1 city". Test in Task 4.

---

### Task 1: Pure year summary (server)

**Files:** Create `functions/src/yearInTravel.ts`; Test `__tests__/functions/yearInTravel.test.ts`

**Interfaces — Produces:**
```ts
export interface YTStop { lat: number | null; lng: number | null; type: string; order: number; photoUrls: string[] }
export interface YTDay { dayNumber: number; stops: YTStop[] }
export interface YTTrip { id: string; title: string; authorUid: string; members: string[]; start: Date | null; end: Date | null;
  cities: { name: string; countryCode: string | null; lat: number | null; lng: number | null }[]; travelStyles: string[]; days: YTDay[] }
export interface YearSummary { year: number; trips: number; daysAway: number; cities: number; countries: number; km: number;
  longestTrip: { tripId: string; title: string; days: number } | null; biggestDay: { tripId: string; title: string; dayNumber: number; stops: number } | null;
  typeCounts: Record<'restaurant' | 'activity' | 'hotel' | 'flight' | 'transport' | 'free', number>; topStyle: string | null;
  places: { name: string; lat: number; lng: number }[]; photos: string[]; companions: { uid: string; name: string; avatarUrl: string | null }[];
  nextTrip: { tripId: string; title: string; startMs: number } | null; computedAtMs: number }
export function tripDaysInYear(start: Date, end: Date, year: number): number;
export function yearSummary(i: { uid: string; year: number; nowMs: number; trips: YTTrip[]; reviewPhotos: string[];
  profiles: Record<string, { name: string; avatarUrl: string | null }>; blocked: Set<string>; upcoming: { tripId: string; title: string; startMs: number }[] }): YearSummary;
export const earthFraction: (km: number) => number;
```
Dates are read as UTC calendar days (`Date.UTC(y, m, d)` from `getUTCFullYear/Month/Date`), matching how trips store dates at noon UTC.

- [ ] **Step 1: Write the failing tests**

```ts
import { tripDaysInYear, yearSummary, earthFraction, type YTTrip } from '../../functions/src/yearInTravel';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const stop = (lat: number | null, lng: number | null, type = 'activity', order = 0, photoUrls: string[] = []) => ({ lat, lng, type, order, photoUrls });
const trip = (o: Partial<YTTrip> & { id: string }): YTTrip => ({
  title: o.id, authorUid: 'me', members: ['me'], start: d('2026-05-01'), end: d('2026-05-03'),
  cities: [{ name: 'Lisbon', countryCode: 'PT', lat: 38.72, lng: -9.14 }], travelStyles: [], days: [], ...o,
});
const base = { uid: 'me', year: 2026, nowMs: Date.UTC(2026, 10, 1), reviewPhotos: [], profiles: {}, blocked: new Set<string>(), upcoming: [] };

describe('tripDaysInYear', () => {
  it('counts inclusive calendar days, clipped to the year', () => {
    expect(tripDaysInYear(d('2026-05-01'), d('2026-05-03'), 2026)).toBe(3);
    expect(tripDaysInYear(d('2026-12-28'), d('2027-01-03'), 2026)).toBe(4);
    expect(tripDaysInYear(d('2026-12-28'), d('2027-01-03'), 2027)).toBe(3);
    expect(tripDaysInYear(d('2025-03-01'), d('2025-03-04'), 2026)).toBe(0);
    expect(tripDaysInYear(d('2028-02-28'), d('2028-03-01'), 2028)).toBe(3); // leap day
  });
});

describe('yearSummary', () => {
  it('counts trips, cities, countries once; overlapping days once', () => {
    const s = yearSummary({ ...base, trips: [
      trip({ id: 'a', start: d('2026-05-01'), end: d('2026-05-05'), cities: [{ name: 'Lisbon', countryCode: 'PT', lat: 38.7, lng: -9.1 }, { name: 'Porto', countryCode: 'PT', lat: 41.1, lng: -8.6 }] }),
      trip({ id: 'b', authorUid: 'friend', members: ['friend', 'me'], start: d('2026-05-04'), end: d('2026-05-06'), cities: [{ name: 'lisbon', countryCode: 'PT', lat: 38.7, lng: -9.1 }] }),
      trip({ id: 'old', start: d('2025-01-01'), end: d('2025-01-02') }),
    ] });
    expect(s.trips).toBe(2);
    expect(s.daysAway).toBe(6); // May 1–6
    expect(s.cities).toBe(2);
    expect(s.countries).toBe(1);
    expect(s.longestTrip).toEqual({ tripId: 'a', title: 'a', days: 5 });
  });
  it('km between consecutive located stops by day then order; unlocated stops skipped', () => {
    const s = yearSummary({ ...base, trips: [trip({ id: 'a', days: [
      { dayNumber: 2, stops: [stop(38.80, -9.10, 'activity', 0)] },
      { dayNumber: 1, stops: [stop(38.71, -9.14, 'restaurant', 1), stop(null, null, 'free', 0), stop(38.70, -9.14, 'activity', 0)] },
    ] })] });
    expect(s.km).toBeGreaterThan(10);
    expect(s.km).toBeLessThan(13);
    expect(s.typeCounts.restaurant).toBe(1);
    expect(s.typeCounts.free).toBe(1);
    expect(s.biggestDay).toEqual({ tripId: 'a', title: 'a', dayNumber: 1, stops: 3 });
  });
  it('photos only from trips I authored plus my review photos, at most 6', () => {
    const s = yearSummary({ ...base, reviewPhotos: ['r1'], trips: [
      trip({ id: 'mine', days: [{ dayNumber: 1, stops: [stop(1, 1, 'activity', 0, ['m1', 'm2'])] }] }),
      trip({ id: 'theirs', authorUid: 'friend', members: ['friend', 'me'], days: [{ dayNumber: 1, stops: [stop(1, 1, 'activity', 0, ['t1'])] }] }),
    ] });
    expect(s.photos).toEqual(expect.arrayContaining(['m1', 'm2', 'r1']));
    expect(s.photos).not.toContain('t1');
  });
  it('companions are the other members, blocked people left out', () => {
    const s = yearSummary({ ...base, blocked: new Set(['x']),
      profiles: { friend: { name: 'Sam', avatarUrl: null }, x: { name: 'X', avatarUrl: null } },
      trips: [trip({ id: 'a', members: ['me', 'friend', 'x'] })] });
    expect(s.companions).toEqual([{ uid: 'friend', name: 'Sam', avatarUrl: null }]);
  });
  it('top style from travel styles, else from stop types; next trip passed through', () => {
    const s = yearSummary({ ...base, upcoming: [{ tripId: 'n', title: 'Tokyo', startMs: 5 }],
      trips: [trip({ id: 'a', travelStyles: ['foodie', 'cultural'] }), trip({ id: 'b', travelStyles: ['foodie'] })] });
    expect(s.topStyle).toBe('foodie');
    expect(s.nextTrip).toEqual({ tripId: 'n', title: 'Tokyo', startMs: 5 });
    const t = yearSummary({ ...base, trips: [trip({ id: 'a', days: [{ dayNumber: 1, stops: [stop(1, 1, 'restaurant'), stop(1, 1, 'restaurant'), stop(1, 1, 'activity')] }] })] });
    expect(t.topStyle).toBe('foodie');
  });
  it('places follow each trip\'s cities in order, located only', () => {
    const s = yearSummary({ ...base, trips: [trip({ id: 'a', cities: [{ name: 'A', countryCode: 'PT', lat: 1, lng: 2 }, { name: 'B', countryCode: 'PT', lat: null, lng: null }] })] });
    expect(s.places).toEqual([{ name: 'A', lat: 1, lng: 2 }]);
  });
  it('no trips: zeros', () => {
    const s = yearSummary({ ...base, trips: [] });
    expect([s.trips, s.daysAway, s.km, s.cities]).toEqual([0, 0, 0, 0]);
    expect(s.longestTrip).toBeNull();
  });
});

describe('earthFraction', () => {
  it('km over the equator', () => expect(earthFraction(40075)).toBeCloseTo(1));
});
```

- [ ] **Step 2: Run** `npx jest __tests__/functions/yearInTravel.test.ts --watchAll=false` → FAIL (module missing).

- [ ] **Step 3: Implement `functions/src/yearInTravel.ts`**

```ts
/**
 * Year in Travel (spec 2026-11-01-year-in-travel-design.md): one person's travel year, from their own and joined
 * trips. Pure — yearInTravelFunctions.ts reads the trips. Photos only the person took; companions never blocked.
 */
export interface YTStop { lat: number | null; lng: number | null; type: string; order: number; photoUrls: string[] }
export interface YTDay { dayNumber: number; stops: YTStop[] }
export interface YTTrip { id: string; title: string; authorUid: string; members: string[]; start: Date | null; end: Date | null;
  cities: { name: string; countryCode: string | null; lat: number | null; lng: number | null }[]; travelStyles: string[]; days: YTDay[] }
type Types = 'restaurant' | 'activity' | 'hotel' | 'flight' | 'transport' | 'free';
export interface YearSummary { year: number; trips: number; daysAway: number; cities: number; countries: number; km: number;
  longestTrip: { tripId: string; title: string; days: number } | null; biggestDay: { tripId: string; title: string; dayNumber: number; stops: number } | null;
  typeCounts: Record<Types, number>; topStyle: string | null; places: { name: string; lat: number; lng: number }[]; photos: string[];
  companions: { uid: string; name: string; avatarUrl: string | null }[]; nextTrip: { tripId: string; title: string; startMs: number } | null; computedAtMs: number }

const DAY = 86_400_000;
const utcDay = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());

export function tripDaysInYear(start: Date, end: Date, year: number): number {
  const a = Math.max(utcDay(start), Date.UTC(year, 0, 1));
  const b = Math.min(utcDay(end), Date.UTC(year, 11, 31));
  return b < a ? 0 : Math.round((b - a) / DAY) + 1;
}

const R = 6371;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const earthFraction = (k: number) => k / 40_075;

export function yearSummary(i: { uid: string; year: number; nowMs: number; trips: YTTrip[]; reviewPhotos: string[];
  profiles: Record<string, { name: string; avatarUrl: string | null }>; blocked: Set<string>; upcoming: { tripId: string; title: string; startMs: number }[] }): YearSummary {
  const trips = i.trips.filter((t) => t.start && t.end && tripDaysInYear(t.start, t.end, i.year) > 0);
  const daySet = new Set<number>();
  const cities = new Set<string>(), countries = new Set<string>();
  const typeCounts: Record<Types, number> = { restaurant: 0, activity: 0, hotel: 0, flight: 0, transport: 0, free: 0 };
  const styleCounts = new Map<string, number>();
  const places: { name: string; lat: number; lng: number }[] = [];
  const photos: string[] = [];
  const companionIds: string[] = [];
  let totalKm = 0;
  let longest: YearSummary['longestTrip'] = null;
  let biggest: YearSummary['biggestDay'] = null;
  for (const t of [...trips].sort((a, b) => a.start!.getTime() - b.start!.getTime())) {
    const from = Math.max(utcDay(t.start!), Date.UTC(i.year, 0, 1)), to = Math.min(utcDay(t.end!), Date.UTC(i.year, 11, 31));
    for (let x = from; x <= to; x += DAY) daySet.add(x);
    const days = tripDaysInYear(t.start!, t.end!, i.year);
    if (!longest || days > longest.days) longest = { tripId: t.id, title: t.title, days };
    for (const c of t.cities) {
      cities.add(c.name.trim().toLowerCase());
      if (c.countryCode) countries.add(c.countryCode.toUpperCase());
      if (c.lat != null && c.lng != null) places.push({ name: c.name, lat: c.lat, lng: c.lng });
    }
    for (const s of t.travelStyles) styleCounts.set(s, (styleCounts.get(s) ?? 0) + 1);
    let prev: { lat: number; lng: number } | null = null;
    for (const day of [...t.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
      if (!biggest || day.stops.length > biggest.stops) biggest = { tripId: t.id, title: t.title, dayNumber: day.dayNumber, stops: day.stops.length };
      for (const s of [...day.stops].sort((a, b) => a.order - b.order)) {
        if (s.type in typeCounts) typeCounts[s.type as Types]++;
        if (t.authorUid === i.uid) photos.push(...s.photoUrls);
        if (s.lat == null || s.lng == null) continue;
        const here = { lat: s.lat, lng: s.lng };
        if (prev) totalKm += km(prev, here);
        prev = here;
      }
    }
    for (const m of t.members) if (m !== i.uid && !i.blocked.has(m) && !companionIds.includes(m)) companionIds.push(m);
  }
  photos.push(...i.reviewPhotos);
  let topStyle: string | null = null, best = 0;
  for (const [k, v] of styleCounts) if (v > best) { best = v; topStyle = k; }
  if (!topStyle) {
    if (typeCounts.restaurant > 0 && typeCounts.restaurant >= typeCounts.activity) topStyle = 'foodie';
    else if (typeCounts.activity > 0) topStyle = 'adventure';
  }
  return {
    year: i.year, trips: trips.length, daysAway: daySet.size, cities: cities.size, countries: countries.size, km: Math.round(totalKm),
    longestTrip: longest, biggestDay: biggest && biggest.stops > 0 ? biggest : null, typeCounts, topStyle, places,
    photos: [...new Set(photos)].reverse().slice(0, 6),
    companions: companionIds.filter((u) => i.profiles[u]).slice(0, 8).map((u) => ({ uid: u, name: i.profiles[u].name, avatarUrl: i.profiles[u].avatarUrl })),
    nextTrip: [...i.upcoming].sort((a, b) => a.startMs - b.startMs)[0] ?? null, computedAtMs: i.nowMs,
  };
}
```

- [ ] **Step 4: Run** the test → PASS. If the km test's bounds miss, compute the expected haversine for the fixture and adjust the fixture bounds (Ruling), never the formula.
- [ ] **Step 5: Commit** `feat(year): pure year-in-travel summary`.

---

### Task 2: Callable + cache

**Files:** Create `functions/src/yearInTravelFunctions.ts`; Modify `functions/src/index.ts`.

**Interfaces — Consumes** Task 1. **Produces** callable `yearInTravel({ year }) → YearSummary`.

- [ ] **Step 1: Write the function**

```ts
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { yearSummary, type YTTrip, type YearSummary } from './yearInTravel';

const db = admin.firestore();
const DAY_MS = 86_400_000;
const toDate = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toDate() : null);
const ms = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toMillis() : 0);

/** The caller's travel year (Year in Travel), cached a day in users/{uid}/private/yearInTravel_{year}. */
export const yearInTravel = onCall({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 60 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const year = Number((req.data as { year?: unknown })?.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new HttpsError('invalid-argument', 'year is required');
  const now = Date.now();
  const [own, joined] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const all = [...own.docs, ...joined.docs.filter((j) => !own.docs.some((o) => o.id === j.id))];
  const inYear = all.filter((t) => {
    const s = toDate(t.get('startDate')), e = toDate(t.get('endDate'));
    return s && e && s.getUTCFullYear() <= year && e.getUTCFullYear() >= year;
  });
  const cacheRef = db.doc(`users/${uid}/private/yearInTravel_${year}`);
  const cached = (await cacheRef.get()).data() as YearSummary | undefined;
  const newest = Math.max(0, ...inYear.map((t) => ms(t.get('updatedAt'))));
  if (cached && now - cached.computedAtMs < DAY_MS && newest <= cached.computedAtMs) return cached;

  const trips: YTTrip[] = await Promise.all(inYear.map(async (t) => {
    const d = t.data();
    const days = await t.ref.collection('days').get();
    const dayRows = await Promise.all(days.docs.map(async (day) => {
      const acts = await day.ref.collection('activities').get();
      const stops = await Promise.all(acts.docs.map(async (a) => {
        const journal = d.authorUid === uid ? (await a.ref.collection('journal').doc('entry').get()).get('photoUrls') : null;
        return { lat: typeof a.get('lat') === 'number' ? a.get('lat') : null, lng: typeof a.get('lng') === 'number' ? a.get('lng') : null,
          type: String(a.get('type') ?? 'activity'), order: Number(a.get('order') ?? 0),
          photoUrls: Array.isArray(journal) ? journal.filter((u: unknown): u is string => typeof u === 'string') : [] };
      }));
      return { dayNumber: Number(day.get('dayNumber') ?? 0), stops };
    }));
    const dests = [d.destination, ...(d.additionalDestinations ?? [])].filter(Boolean);
    return { id: t.id, title: String(d.title ?? 'Trip'), authorUid: d.authorUid, members: [d.authorUid, ...(d.collaborators ?? [])],
      start: toDate(d.startDate), end: toDate(d.endDate), travelStyles: Array.isArray(d.travelStyles) ? d.travelStyles : [],
      cities: dests.map((x: { name?: string; countryCode?: string; lat?: number; lng?: number }) => ({ name: String(x.name ?? ''), countryCode: x.countryCode ?? null,
        lat: typeof x.lat === 'number' ? x.lat : null, lng: typeof x.lng === 'number' ? x.lng : null })).filter((c: { name: string }) => c.name),
      days: dayRows };
  }));
  const reviews = await db.collection('placeReviews').where('authorUid', '==', uid).get();
  const reviewPhotos = reviews.docs.filter((r) => { const c = toDate(r.get('createdAt')); return c && c.getUTCFullYear() === year; })
    .flatMap((r) => (Array.isArray(r.get('photoUrls')) ? r.get('photoUrls') : []));
  const memberIds = [...new Set(trips.flatMap((t) => t.members).filter((m) => m && m !== uid))].slice(0, 30);
  const [profileDocs, blockedDocs] = await Promise.all([
    memberIds.length ? db.getAll(...memberIds.map((m) => db.doc(`users/${m}`))) : Promise.resolve([]),
    db.collection(`users/${uid}/blocked`).get(),
  ]);
  const profiles: Record<string, { name: string; avatarUrl: string | null }> = {};
  for (const p of profileDocs) if (p.exists) profiles[p.id] = { name: String(p.get('fullName') ?? p.get('displayName') ?? 'Traveler'), avatarUrl: p.get('avatarUrl') ?? null };
  const upcoming = all.map((t) => ({ tripId: t.id, title: String(t.get('title') ?? 'Trip'), startMs: ms(t.get('startDate')) })).filter((t) => t.startMs > now);
  const summary = yearSummary({ uid, year, nowMs: now, trips, reviewPhotos, profiles, blocked: new Set(blockedDocs.docs.map((b) => b.id)), upcoming });
  await cacheRef.set(summary);
  return summary;
});
```

- [ ] **Step 2:** `functions/src/index.ts`: `export { yearInTravel } from './yearInTravelFunctions';`
- [ ] **Step 3:** Verify `deleteAccount` deletes `users/{uid}` recursively including `private/*` (read `functions/src/deleteAccount.ts`); if it doesn't, add `yearInTravel_*` deletion and ledger it.
- [ ] **Step 4:** `(cd functions && npm run build) && npx jest --watchAll=false` → clean/pass. Commit `feat(year): yearInTravel callable with a day's cache`.

---

### Task 3: World dots + map math

**Files:** Create `scripts/build-world-dots.mjs`, `assets/yearInTravel/worldDots.json`, `utils/yearMap.ts`; Test `__tests__/utils/yearMap.test.ts`.

**Interfaces — Produces:** `project(lat, lng, width, height): { x: number; y: number }` (equirectangular, lng −180…180 → 0…width, lat 85…−60 → 0…height); `arcPath(a: {lat,lng}, b: {lat,lng}, width, height): string` (SVG quadratic path; when |Δlng| > 180 the arc goes the short way by drawing to the wrapped point and clipping by the frame); `worldDots(): [number, number][]` (lat,lng pairs from the asset).

- [ ] **Step 1: Tests**

```ts
import { project, arcPath, shortLngDelta } from '@/utils/yearMap';
describe('yearMap', () => {
  it('projects corners and the centre', () => {
    expect(project(85, -180, 360, 145)).toEqual({ x: 0, y: 0 });
    expect(project(-60, 180, 360, 145)).toEqual({ x: 360, y: 145 });
  });
  it('the short way across the antimeridian', () => {
    expect(shortLngDelta(139.7, -118.2)).toBeCloseTo(102.1, 1); // Tokyo → LA goes east across 180
    expect(shortLngDelta(-9.1, 139.7)).toBeCloseTo(148.8, 1);
  });
  it('arc path is an SVG quadratic curve', () => {
    expect(arcPath({ lat: 38.7, lng: -9.1 }, { lat: 41.9, lng: 12.5 }, 360, 145)).toMatch(/^M[\d.]+ [\d.]+ Q[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement `utils/yearMap.ts`:

```ts
/** Year in Travel's world map: equirectangular projection (lat 85…−60, Antarctica cropped) and arcs the short way round. Pure. */
import dots from '@/assets/yearInTravel/worldDots.json';
const TOP = 85, BOTTOM = -60;
export function project(lat: number, lng: number, width: number, height: number) {
  return { x: Math.round(((lng + 180) / 360) * width * 100) / 100, y: Math.round(((TOP - lat) / (TOP - BOTTOM)) * height * 100) / 100 };
}
export function shortLngDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
export function arcPath(a: { lat: number; lng: number }, b: { lat: number; lng: number }, width: number, height: number): string {
  const p = project(a.lat, a.lng, width, height);
  const q = project(b.lat, a.lng + shortLngDelta(a.lng, b.lng), width, height);
  const lift = Math.min(40, Math.hypot(q.x - p.x, q.y - p.y) * 0.25);
  const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2 - lift;
  return `M${p.x} ${p.y} Q${Math.round(cx * 100) / 100} ${Math.round(cy * 100) / 100} ${q.x} ${q.y}`;
}
export const worldDots = (): [number, number][] => dots as [number, number][];
```

- [ ] **Step 4:** `scripts/build-world-dots.mjs`: fetch `https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json` (Natural Earth, public domain), decode TopoJSON arcs (implement the small delta-decode + ring assembly inline, no dependency), point-in-polygon test every 2.5° grid point between lat 85 and −60, write `assets/yearInTravel/worldDots.json` as `[[lat,lng],…]` (expect ~1 800–2 400 points). Run it; commit the JSON. `jest` must map `.json` imports (it does by default).
- [ ] **Step 5:** tests pass; commit `feat(year): dot-matrix world and arc math`.

---

### Task 4: App rules (story, window, copy)

**Files:** Create `utils/yearInTravel.ts`; Test `__tests__/utils/yearInTravel.test.ts`.

**Interfaces — Produces:**
```ts
export type SlideId = 'opener' | 'numbers' | 'map' | 'records' | 'taste' | 'photos' | 'companions' | 'next' | 'share';
export function visibleSlides(s: { trips: number; photos: string[]; companions: unknown[]; places: unknown[]; longestTrip: unknown }): SlideId[];
export const SLIDE_MS = 6000;
export interface StoryState { index: number; elapsed: number; paused: boolean; done: boolean }
export function storyStep(s: StoryState, a: { type: 'tick'; dt: number; count: number } | { type: 'next' | 'prev'; count: number } | { type: 'pause' | 'resume' }): StoryState;
export function showYearCard(now: Date): number | null;   // the year to celebrate, or null outside Dec 1 – Jan 15
export function kmLine(km: number): string;               // "You covered 18,400 km — about 46% of the way around the Earth."
export function styleLine(style: string | null): string | null; // "You travel like a Foodie"
export function typeLine(c: { restaurant: number; activity: number }): string | null;
export function countLabel(n: number, one: string, many: string): string; // "1 trip", "3 trips"
```

- [ ] **Step 1: Tests** (pin: no trips → only `opener`,`next`; photos/companions hidden when empty; map hidden with no places; `storyStep` tick advances after 6 s, `next` on last → done, `prev` on first stays, pause stops ticks; `showYearCard` Nov 30 → null, Dec 1 2026 → 2026, Dec 31 → 2026, Jan 15 2027 → 2026, Jan 16 2027 → null; `kmLine(0)` → `null`-free short line "Every journey starts somewhere." , `kmLine(18400)` contains "18,400 km" and "46%", `kmLine(80150)` says "around the Earth twice"; `styleLine('foodie')` = "You travel like a Foodie", `styleLine(null)` = null; `typeLine({restaurant:1,activity:0})` = "You saved 1 restaurant"; `countLabel(1,'trip','trips')` = "1 trip").
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (all pure; `kmLine`: `toLocaleString('en-US')`, ≥ 2× → "around the Earth N times" with "twice" for 2, else percent rounded). **Step 4:** pass. **Step 5:** commit `feat(year): story, window and copy rules`.

---

### Task 5: Screen, slides, share, entry points

**Files:** Create `hooks/useYearInTravel.ts`, `app/year/[year].tsx`, `components/yearInTravel/{YearStory,SlideOpener,SlideNumbers,SlideMap,SlideRecords,SlideTaste,SlidePhotos,SlideCompanions,SlideNext,SlideShare,ShareFrame,YearCard}.tsx`; Modify `app/_layout.tsx` (`<Stack.Screen name="year/[year]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />`), `app/(tabs)/index.tsx` (YearCard above the Today/next card when `showYearCard(now)`), `app/(tabs)/profile.tsx` (row "Your {year} in travel" when the cached summary has trips ≥ 1 — use `useYearInTravel(currentYear, { enabled: hasPastTripThisYear })` so Profile doesn't call the function for nobody), `package.json` (`npx expo install react-native-view-shot`).

**Interfaces — Consumes:** Tasks 1–4.

- `useYearInTravel(year, opts?)`: `useQuery(['yearInTravel', uid, year], () => httpsCallable(functions,'yearInTravel')({year}).then(r=>r.data as YearSummary), { staleTime: 3_600_000, enabled })`. Type `YearSummary` duplicated in `types/yearInTravel.ts` (separate TS projects — same shape as Task 1).
- `YearStory`: `useReducer(storyStep)`, rAF tick while focused and not Reduce-Motion-paused; tap zones (left third prev, right two-thirds next), `onLongPress` pause / `onPressOut` resume, swipe-down (`PanResponder` dy > 80) closes; progress bars at top (one per visible slide); Light haptic on slide change; close X (44 pt, `accessibilityLabel="Close"`); per-slide **Share** button (not on companions) → `captureRef(shareFrameRef, { format: 'png', width: 1080, height: 1920, result: 'tmpfile' })` → `Sharing.shareAsync(uri, { mimeType: 'image/png' })`. `ShareFrame` renders the current slide's content at 1080 × 1920 off-screen (`position: absolute, left: -10000`) with the star (`assets/images/SupernovaStar.png`) and "supernovatravel.xyz", never the companions slide.
- Slides: dark (`DarkColors`, add `app/year/[year].tsx` + `components/yearInTravel/*` to CLAUDE.md's always-dark list), big numbers with `Animated` count-up (skip when Reduce Motion), map via `react-native-svg` (`worldDots` as 1.4 px circles at 35 % opacity, places as gradient dots with glow, `arcPath` strokes drawn in with `strokeDashoffset` animation), photos as a 2×3 collage (expo-image), companions as avatar row with first names.
- `YearCard` (Home): gradient border card "Your {year} in travel" + "See your year" → `router.push(`/year/${year}`)`; when the summary says trips 0 → "Your year in travel starts with one trip" + "Plan a trip" → Create tab.
- [ ] Steps: install view-shot; write files; `npx tsc --noEmit -p .`; full jest; supernova-design checklist (ledger); commit `feat(year): Year in Travel story with shareable slides`.

---

### Task 6: Docs

- [ ] CLAUDE.md: Cloud Functions bullet **Year in Travel** (callable, cache, rules, photos/companions privacy), routing tree `year/[year].tsx`, always-dark list; Current state "Pending" → note the Nov 25 submit target. Full suite; commit `docs(year): Year in Travel in CLAUDE.md`.
