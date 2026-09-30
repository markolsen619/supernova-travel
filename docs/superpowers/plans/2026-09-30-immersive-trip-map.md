# Immersive Trip Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trip map's straight lines and flat top-down view with 3D terrain, real cached routes, proper stop markers, an AllTrails-style self-drawing flyover, and a Planned | Actual view after the trip.

**Architecture:** All geometry decisions live in pure, tested modules (`utils/tripRoutes.ts`, `utils/flyover.ts`). One network call (`services/mapboxDirections.ts`) fetches a leg; `hooks/useTripRoutes.ts` reads/writes one cache document per trip. `components/trip/TripMapView.tsx` renders terrain, routed lines (drawn with `lineTrimOffset`), markers, and drives the camera.

**Tech Stack:** Expo SDK 54, React Native 0.81 (New Architecture), `@rnmapbox/maps` 10.3.2 (`Terrain`, `RasterDemSource`, `Atmosphere`, `MarkerView`, `LineLayer` `lineTrimOffset`), Mapbox Directions API v5, Firebase JS SDK (Firestore), TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-09-30-discovery-and-trip-map-design.md` — Part 1.

## Global Constraints

- No Google Places calls anywhere on the trip map.
- Mapbox token: `process.env.EXPO_PUBLIC_MAPBOX_TOKEN`; Directions request `https://api.mapbox.com/directions/v5/mapbox/{walking|driving}/{lng,lat;lng,lat}?geometries=polyline6&overview=simplified&access_token=…`.
- Leg modes: `walking` < 2,500 m; `arc` for `flight`, for `transport` whose title/notes mention ferry or boat, or > 400,000 m; otherwise `driving`. A failed/empty Directions response is cached as an `arc`.
- Cache: one Firestore document `trips/{tripId}/routes/cache`, field `legs: { [legKey]: { mode, polyline, meters } }`, written with `setDoc(…, { merge: true })`. Only owner/collaborators write.
- No location permission; the actual trip comes only from `visited`/`visitedAt`.
- Always-dark immersive screen: `TripMapView` keeps using `DarkColors` (Architecture Rule 3).
- House spring `SPRING` from `@/constants/motion`; haptics Light on select, Medium on toggles that write.
- Reduce Motion (`AccessibilityInfo.isReduceMotionEnabled()`): no flyover; routes drawn fully.
- Tests are pure-function Jest tests only (no renderer in this repo). `@/` imports everywhere.
- Commit messages end with the two attribution lines used on this branch.

## Review Focus

1. **A day with a single grounded stop, or none** — no leg, no crash; flyover skips the day.
2. **Two stops at the same coordinates** (check-in and check-out at one hotel) — zero-length leg: mode `walking`, no Directions request, path still valid.
3. **A stop moved after its route was cached** — its old leg key simply misses; the new leg is fetched; nothing stale is drawn.
4. **A viewer (not owner/collaborator) opening a trip with no cache** — arcs render, no request and no write is attempted (rules would reject it).
5. **Trip crossing the antimeridian** (e.g. Fiji → Hawaii) — the arc must not wrap the long way round the planet.

Each is pinned by a test in the task that owns the code (Tasks 1, 2, 4).

---

## File structure

- Create `utils/tripRoutes.ts` — leg mode, leg key, haversine, great-circle arc, polyline6 decode, path building with stop fractions, actual order, point-along-path.
- Create `utils/flyover.ts` — flyover state reducer and day durations.
- Create `services/mapboxDirections.ts` — the Directions request and response parsing.
- Create `hooks/useTripRoutes.ts` — cache read, missing-leg fetch (owner only), merge write.
- Modify `firestore.rules` — `trips/{tripId}/routes/{docId}`.
- Modify `components/trip/TripMapView.tsx` — terrain, routed lines, markers, flyover, Planned | Actual.
- Modify `app/trip/[id].tsx` — pass `canEditRoutes`, `tripStatus`, `tripEndDate`.
- Tests: `__tests__/utils/tripRoutes.test.ts`, `__tests__/utils/flyover.test.ts`, `__tests__/services/mapboxDirections.test.ts`.

---

### Task 1: Route geometry (`utils/tripRoutes.ts`)

**Files:**
- Create: `utils/tripRoutes.ts`
- Test: `__tests__/utils/tripRoutes.test.ts`

**Interfaces:**
- Produces:
  - `type LegMode = 'walking' | 'driving' | 'arc'`
  - `interface RouteStop { id: string; type: ActivityType; title: string; notes: string; lat: number; lng: number }`
  - `interface CachedLeg { mode: LegMode; polyline: string | null; meters: number }`
  - `type LegCache = Record<string, CachedLeg>`
  - `haversineMeters(a: {lat,lng}, b: {lat,lng}): number`
  - `legMode(a: RouteStop, b: RouteStop): LegMode`
  - `legKey(mode: LegMode, a: {lat,lng}, b: {lat,lng}): string`
  - `greatCircleArc(a: {lat,lng}, b: {lat,lng}, steps?: number): [number, number][]` (`[lng, lat]`)
  - `decodePolyline6(encoded: string): [number, number][]` (`[lng, lat]`)
  - `interface MissingLeg { key: string; mode: 'walking' | 'driving'; a: RouteStop; b: RouteStop }`
  - `interface BuiltPath { coordinates: [number, number][]; stopFractions: number[]; meters: number; missing: MissingLeg[] }`
  - `buildPath(stops: RouteStop[], cache: LegCache): BuiltPath`
  - `pointAlongPath(coords: [number, number][], t: number): { point: [number, number]; bearing: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/tripRoutes.test.ts
import {
  haversineMeters, legMode, legKey, greatCircleArc, decodePolyline6, buildPath, pointAlongPath,
  type RouteStop, type LegCache,
} from '@/utils/tripRoutes';

const stop = (id: string, lat: number, lng: number, over: Partial<RouteStop> = {}): RouteStop => ({
  id, type: 'activity', title: '', notes: '', lat, lng, ...over,
});

describe('haversineMeters', () => {
  it('measures a known distance', () => {
    // La Paz → Cabo San Lucas is ~135 km as the crow flies.
    const m = haversineMeters({ lat: 24.1426, lng: -110.3128 }, { lat: 22.8905, lng: -109.9167 });
    expect(m).toBeGreaterThan(130_000);
    expect(m).toBeLessThan(145_000);
  });
});

describe('legMode', () => {
  it('walks short hops and drives longer ones', () => {
    expect(legMode(stop('a', 38.7, -9.14), stop('b', 38.705, -9.14))).toBe('walking');
    expect(legMode(stop('a', 38.7, -9.14), stop('b', 38.8, -9.3))).toBe('driving');
  });

  it('draws flights, ferries and very long legs as arcs', () => {
    const far = stop('b', 40.7, -74.0);
    expect(legMode(stop('a', 38.7, -9.14, { type: 'flight' }), stop('b', 38.8, -9.3))).toBe('arc');
    expect(legMode(stop('a', 32.7, -117.2, { type: 'transport', title: 'Ferry to Coronado' }), stop('b', 32.69, -117.17))).toBe('arc');
    expect(legMode(stop('a', 38.7, -9.14), far)).toBe('arc');
  });

  it('treats two stops at the same spot as a zero-length walk', () => {
    expect(legMode(stop('in', 24.1, -110.3, { type: 'hotel' }), stop('out', 24.1, -110.3, { type: 'hotel' }))).toBe('walking');
  });
});

describe('legKey', () => {
  it('changes when either end moves, and is stable to 5 decimals', () => {
    const a = { lat: 38.7, lng: -9.14 };
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).toBe(legKey('walking', a, { lat: 38.705000001, lng: -9.14 }));
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).not.toBe(legKey('walking', a, { lat: 38.706, lng: -9.14 }));
    expect(legKey('walking', a, { lat: 38.705, lng: -9.14 })).not.toBe(legKey('driving', a, { lat: 38.705, lng: -9.14 }));
  });
});

describe('greatCircleArc', () => {
  it('starts and ends on the two points', () => {
    const arc = greatCircleArc({ lat: 38.7, lng: -9.14 }, { lat: 40.7, lng: -74.0 }, 16);
    expect(arc[0][0]).toBeCloseTo(-9.14, 3);
    expect(arc[arc.length - 1][0]).toBeCloseTo(-74.0, 3);
    expect(arc).toHaveLength(17);
  });

  it('crosses the antimeridian the short way', () => {
    // Fiji (178°E) → Hawaii (157°W): every longitude step stays small.
    const arc = greatCircleArc({ lat: -17.7, lng: 178.0 }, { lat: 21.3, lng: -157.8 }, 32);
    for (let i = 1; i < arc.length; i++) {
      expect(Math.abs(arc[i][0] - arc[i - 1][0])).toBeLessThan(20);
    }
  });
});

describe('decodePolyline6', () => {
  it('decodes a two-point polyline6 as [lng, lat]', () => {
    // Encodes (38.5, -120.2), (40.7, -120.95) at precision 6.
    expect(decodePolyline6('_izlhA~rlgdF_{geC~ywl@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
    ]);
  });
});

describe('buildPath', () => {
  const a = stop('a', 38.70, -9.14);
  const b = stop('b', 38.80, -9.30);
  const c = stop('c', 38.801, -9.30);

  it('lists driving/walking legs missing from the cache and draws them as arcs meanwhile', () => {
    const path = buildPath([a, b, c], {});
    expect(path.missing.map((m) => m.mode)).toEqual(['driving', 'walking']);
    expect(path.coordinates[0]).toEqual([a.lng, a.lat]);
    expect(path.coordinates[path.coordinates.length - 1]).toEqual([c.lng, c.lat]);
  });

  it('uses a cached leg instead of an arc, and adds up its meters', () => {
    const cache: LegCache = {
      [legKey('driving', a, b)]: { mode: 'driving', polyline: '_izlhA~rlgdF_{geC~ywl@', meters: 20_000 },
    };
    const path = buildPath([a, b], cache);
    expect(path.missing).toEqual([]);
    expect(path.meters).toBe(20_000);
    expect(path.coordinates).toContainEqual([-120.95, 40.7]);
  });

  it('marks where each stop sits along the path, from 0 to 1', () => {
    const path = buildPath([a, b, c], {});
    expect(path.stopFractions[0]).toBe(0);
    expect(path.stopFractions[2]).toBe(1);
    expect(path.stopFractions[1]).toBeGreaterThan(0.9); // b→c is a few metres of a ~16 km path
  });

  it('handles zero or one stop without legs', () => {
    expect(buildPath([], {})).toEqual({ coordinates: [], stopFractions: [], meters: 0, missing: [] });
    expect(buildPath([a], {})).toEqual({ coordinates: [[a.lng, a.lat]], stopFractions: [0], meters: 0, missing: [] });
  });

  it('never requests a zero-length leg', () => {
    const same = stop('same', a.lat, a.lng);
    expect(buildPath([a, same], {}).missing).toEqual([]);
  });
});

describe('pointAlongPath', () => {
  const line: [number, number][] = [[0, 0], [0, 1], [1, 1]];

  it('returns the ends at 0 and 1', () => {
    expect(pointAlongPath(line, 0).point).toEqual([0, 0]);
    expect(pointAlongPath(line, 1).point).toEqual([1, 1]);
  });

  it('interpolates by distance and faces the direction of travel', () => {
    const mid = pointAlongPath(line, 0.25);
    expect(mid.point[0]).toBeCloseTo(0, 5);
    expect(mid.point[1]).toBeCloseTo(0.5, 2);
    expect(mid.bearing).toBeCloseTo(0, 0); // heading north
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/tripRoutes.test.ts`
Expected: FAIL — cannot find module `@/utils/tripRoutes`.

- [ ] **Step 3: Implement**

```ts
// utils/tripRoutes.ts
import type { ActivityType } from '@/types';

/**
 * Pure geometry for the trip map (components/trip/TripMapView). Every "which
 * kind of line, from where to where, how long" decision lives here so it can
 * be tested; the only network call is services/mapboxDirections.
 */

export type LegMode = 'walking' | 'driving' | 'arc';

export interface RouteStop {
  id: string;
  type: ActivityType;
  title: string;
  notes: string;
  lat: number;
  lng: number;
}

export interface CachedLeg {
  mode: LegMode;
  /** Mapbox polyline6; null when the leg is drawn as an arc. */
  polyline: string | null;
  meters: number;
}

export type LegCache = Record<string, CachedLeg>;

export interface MissingLeg {
  key: string;
  mode: 'walking' | 'driving';
  a: RouteStop;
  b: RouteStop;
}

export interface BuiltPath {
  /** [lng, lat], the whole path in order. */
  coordinates: [number, number][];
  /** Where each input stop sits along the path, 0 → 1, by distance. */
  stopFractions: number[];
  meters: number;
  /** Walking/driving legs with no cached route yet — drawn as arcs meanwhile. */
  missing: MissingLeg[];
}

type LatLng = { lat: number; lng: number };

export const WALK_MAX_METERS = 2_500;
export const ARC_MIN_METERS = 400_000;
const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const WATER_CROSSING = /\b(ferry|boat|catamaran|cruise)\b/i;

export function legMode(a: RouteStop, b: RouteStop): LegMode {
  if (a.type === 'flight' || b.type === 'flight') return 'arc';
  for (const s of [a, b]) {
    if (s.type === 'transport' && WATER_CROSSING.test(`${s.title} ${s.notes}`)) return 'arc';
  }
  const meters = haversineMeters(a, b);
  if (meters > ARC_MIN_METERS) return 'arc';
  return meters < WALK_MAX_METERS ? 'walking' : 'driving';
}

export function legKey(mode: LegMode, a: LatLng, b: LatLng): string {
  const p = (n: number) => n.toFixed(5);
  return `${mode}:${p(a.lat)},${p(a.lng)}>${p(b.lat)},${p(b.lng)}`;
}

/** Spherical interpolation; longitudes are unwrapped so the antimeridian is crossed the short way. */
export function greatCircleArc(a: LatLng, b: LatLng, steps = 32): [number, number][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng), φ2 = toRad(b.lat), λ2 = toRad(b.lng);
  const d = haversineMeters(a, b) / EARTH_RADIUS_M;
  if (d === 0) return [[a.lng, a.lat], [b.lng, b.lat]];
  const out: [number, number][] = [];
  let prevLng: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lng = toDeg(Math.atan2(y, x));
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

export function decodePolyline6(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

function lineMeters(coords: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += haversineMeters({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] });
  }
  return m;
}

export function buildPath(stops: RouteStop[], cache: LegCache): BuiltPath {
  if (stops.length === 0) return { coordinates: [], stopFractions: [], meters: 0, missing: [] };
  const coordinates: [number, number][] = [[stops[0].lng, stops[0].lat]];
  const stopMeters: number[] = [0];
  const missing: MissingLeg[] = [];
  let meters = 0;

  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const mode = legMode(a, b);
    const key = legKey(mode, a, b);
    const cached = cache[key];
    let leg: [number, number][];
    let legM: number;

    if (cached?.polyline) {
      leg = decodePolyline6(cached.polyline);
      legM = cached.meters;
    } else {
      leg = greatCircleArc(a, b);
      legM = cached?.meters ?? lineMeters(leg);
      if (!cached && mode !== 'arc' && haversineMeters(a, b) > 0) missing.push({ key, mode, a, b });
    }
    coordinates.push(...leg.slice(1), [b.lng, b.lat]);
    meters += legM;
    stopMeters.push(meters);
  }

  const stopFractions = stopMeters.map((m) => (meters === 0 ? 0 : m / meters));
  return { coordinates, stopFractions, meters, missing };
}

export function pointAlongPath(coords: [number, number][], t: number): { point: [number, number]; bearing: number } {
  if (coords.length === 0) return { point: [0, 0], bearing: 0 };
  if (coords.length === 1) return { point: coords[0], bearing: 0 };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const l = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const f = segLens[i] === 0 ? 0 : Math.min(1, target / segLens[i]);
      const [x0, y0] = coords[i], [x1, y1] = coords[i + 1];
      const bearing = (toDeg(Math.atan2(x1 - x0, y1 - y0)) + 360) % 360;
      return { point: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], bearing };
    }
    target -= segLens[i];
  }
  return { point: coords[coords.length - 1], bearing: 0 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/tripRoutes.test.ts`
Expected: PASS (all tests). If the polyline6 fixture fails, re-encode `(38.5,-120.2),(40.7,-120.95)` at precision 1e6 and update the fixture string — the decoder must be correct against Mapbox, not the fixture.

- [ ] **Step 5: Commit**

```bash
git add utils/tripRoutes.ts __tests__/utils/tripRoutes.test.ts
git commit -m "feat: route geometry for the trip map — leg modes, arcs, cached paths"
```

### Task 2: Directions request, cache rules and `useTripRoutes`

**Files:**
- Create: `services/mapboxDirections.ts`, `hooks/useTripRoutes.ts`
- Modify: `firestore.rules` (inside `match /trips/{tripId}`)
- Test: `__tests__/services/mapboxDirections.test.ts`

**Interfaces:**
- Consumes: `MissingLeg`, `CachedLeg`, `LegCache` from Task 1.
- Produces:
  - `parseDirectionsResponse(json: unknown): { polyline: string; meters: number } | null`
  - `fetchLeg(leg: MissingLeg): Promise<CachedLeg>` — never throws; failure → `{ mode: 'arc', polyline: null, meters: haversine }`
  - `useTripRoutes(tripId: string, missing: MissingLeg[], canWrite: boolean): { cache: LegCache; isLoading: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/services/mapboxDirections.test.ts
import { parseDirectionsResponse } from '@/services/mapboxDirections';

describe('parseDirectionsResponse', () => {
  it('takes the first route’s geometry and distance', () => {
    expect(parseDirectionsResponse({ code: 'Ok', routes: [{ geometry: 'abc', distance: 1234.5 }] }))
      .toEqual({ polyline: 'abc', meters: 1234.5 });
  });

  it('is null for no route, an error code, or junk', () => {
    expect(parseDirectionsResponse({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseDirectionsResponse({ code: 'Ok', routes: [] })).toBeNull();
    expect(parseDirectionsResponse(null)).toBeNull();
    expect(parseDirectionsResponse({ code: 'Ok', routes: [{ geometry: 42 }] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/services/mapboxDirections.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

```ts
// services/mapboxDirections.ts
import { haversineMeters, type CachedLeg, type MissingLeg } from '@/utils/tripRoutes';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export function parseDirectionsResponse(json: unknown): { polyline: string; meters: number } | null {
  const j = json as { code?: string; routes?: { geometry?: unknown; distance?: unknown }[] } | null;
  if (!j || j.code !== 'Ok') return null;
  const r = j.routes?.[0];
  if (!r || typeof r.geometry !== 'string' || typeof r.distance !== 'number') return null;
  return { polyline: r.geometry, meters: r.distance };
}

/**
 * One leg from Mapbox Directions. Called once per leg ever — the result is
 * cached on the trip (hooks/useTripRoutes). Never throws: anything that
 * isn't a route becomes an arc, and the arc is cached too so an unroutable
 * leg (open water, no roads) isn't retried on every open.
 */
export async function fetchLeg(leg: MissingLeg): Promise<CachedLeg> {
  const arc: CachedLeg = { mode: 'arc', polyline: null, meters: haversineMeters(leg.a, leg.b) };
  if (!TOKEN) return arc;
  const coords = `${leg.a.lng},${leg.a.lat};${leg.b.lng},${leg.b.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${leg.mode}/${coords}?geometries=polyline6&overview=simplified&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[fetchLeg] HTTP', res.status);
      return arc;
    }
    const parsed = parseDirectionsResponse(await res.json());
    return parsed ? { mode: leg.mode, polyline: parsed.polyline, meters: parsed.meters } : arc;
  } catch (err) {
    console.error('[fetchLeg] failed', err);
    return arc;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/services/mapboxDirections.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the rules block**

In `firestore.rules`, inside `match /trips/{tripId} {`, after the `match /packingItems/{itemId} { … }` block, add:

```
      // Cached road/walking routes for the trip map — one doc, `cache`,
      // holding every leg (hooks/useTripRoutes). Anyone who can see the trip
      // can read its routes; only people who can edit it pay to fetch them.
      match /routes/{docId} {
        function parentTrip() {
          return get(/databases/$(database)/documents/trips/$(tripId));
        }
        function canReadTrip() {
          return parentTrip().data.visibility == 'public'
            || isOwner(parentTrip().data.authorUid)
            || (parentTrip().data.visibility == 'followers' && isFollowerOf(parentTrip().data.authorUid))
            || request.auth.uid in parentTrip().data.collaborators;
        }
        function canWriteTrip() {
          return isAuthed() && (
            isOwner(parentTrip().data.authorUid)
            || request.auth.uid in parentTrip().data.collaborators
          );
        }

        allow read: if canReadTrip();
        allow create, update: if canWriteTrip() && docId == 'cache';
        allow delete: if false;
      }
```

Run: `npx firebase-tools deploy --only firestore:rules` — additive only.
Expected: `Deploy complete!`

- [ ] **Step 6: Implement the hook**

```ts
// hooks/useTripRoutes.ts
import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { fetchLeg } from '@/services/mapboxDirections';
import type { LegCache, MissingLeg } from '@/utils/tripRoutes';

/**
 * The trip's cached route legs, filling in any that are missing.
 *
 * `missing` comes from buildPath() for every path the map may draw (each
 * planned day and the actual route). Only an owner/collaborator fetches:
 * a viewer can't write the cache, so fetching for them would re-bill the
 * same legs on every open — they see arcs until the owner opens the trip.
 */
export function useTripRoutes(tripId: string, missing: MissingLeg[], canWrite: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ['tripRoutes', tripId];
  const attempted = useRef<Set<string>>(new Set());

  const { data: cache = {}, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<LegCache> => {
      const snap = await getDoc(doc(db, 'trips', tripId, 'routes', 'cache'));
      return (snap.data()?.legs as LegCache | undefined) ?? {};
    },
    staleTime: 30 * 60 * 1000,
  });

  const missingKey = missing.map((m) => m.key).join('|');
  useEffect(() => {
    if (!canWrite || isLoading) return;
    const todo = missing.filter((m) => !cache[m.key] && !attempted.current.has(m.key));
    if (todo.length === 0) return;
    todo.forEach((m) => attempted.current.add(m.key));

    let cancelled = false;
    (async () => {
      const fetched: LegCache = {};
      // Three at a time: fast enough for a week's itinerary, gentle on the API.
      for (let i = 0; i < todo.length; i += 3) {
        const batch = await Promise.all(todo.slice(i, i + 3).map(async (m) => [m.key, await fetchLeg(m)] as const));
        batch.forEach(([k, v]) => { fetched[k] = v; });
      }
      if (cancelled) return;
      queryClient.setQueryData<LegCache>(queryKey, (old) => ({ ...(old ?? {}), ...fetched }));
      try {
        await setDoc(doc(db, 'trips', tripId, 'routes', 'cache'), { legs: fetched }, { merge: true });
      } catch (err) {
        console.error('[useTripRoutes] cache write failed', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the set of missing legs, not array identity
  }, [missingKey, canWrite, isLoading, tripId]);

  return { cache, isLoading };
}
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: no output.

```bash
git add services/mapboxDirections.ts hooks/useTripRoutes.ts firestore.rules __tests__/services/mapboxDirections.test.ts
git commit -m "feat: fetch and cache trip route legs from Mapbox Directions"
```

### Task 3: Terrain, routed lines and markers in `TripMapView`

**Files:**
- Modify: `components/trip/TripMapView.tsx`
- Modify: `app/trip/[id].tsx:935-952`

**Interfaces:**
- Consumes: `buildPath`, `RouteStop`, `MissingLeg` (Task 1); `useTripRoutes` (Task 2).
- Produces: new `TripMapView` props `canEditRoutes: boolean`, `tripStatus: TripStatus`, `tripEndDate: Date | null`; internal `dayPaths: { dayId: string; color: string; stops: GroundedStop[]; path: BuiltPath }[]` used by Tasks 4–5.

- [ ] **Step 1: Pass the new props from the trip page**

In `app/trip/[id].tsx`, add to `<TripMapView …>`:

```tsx
          canEditRoutes={isOwner || isCollaborator}
          tripStatus={trip.status}
          tripEndDate={trip.endDate ? trip.endDate.toDate() : null}
```

and add them to `TripMapViewProps`:

```ts
  /** Owner or collaborator — only they fetch and cache missing routes. */
  canEditRoutes: boolean;
  tripStatus: TripStatus;
  tripEndDate: Date | null;
```

(import `TripStatus` from `@/types`).

- [ ] **Step 2: Build per-day paths and fetch missing legs**

Replace the `routesCollection` `useMemo` with:

```tsx
  const toRouteStop = (s: GroundedStop): RouteStop => ({
    id: s.activity.id, type: s.activity.type, title: s.activity.title, notes: s.activity.notes ?? '', lat: s.lat, lng: s.lng,
  });

  const stopsByDay = useMemo(() => {
    const byDay = new Map<string, GroundedStop[]>();
    grounded.forEach((s) => byDay.set(s.dayId, [...(byDay.get(s.dayId) ?? []), s]));
    return [...byDay.entries()];
  }, [grounded]);

  // First pass with an empty cache only to learn which legs are missing.
  const allMissing = useMemo(
    () => stopsByDay.flatMap(([, stops]) => buildPath(stops.map(toRouteStop), {}).missing),
    [stopsByDay],
  );
  const { cache } = useTripRoutes(tripId, allMissing, canEditRoutes);

  const dayPaths = useMemo(
    () => stopsByDay.map(([dayId, stops]) => ({
      dayId,
      color: stops[0].dayColor,
      stops,
      path: buildPath(stops.map(toRouteStop), cache),
    })),
    [stopsByDay, cache],
  );

  const routesCollection: GeoJSON.FeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: dayPaths
      .filter((d) => d.path.coordinates.length > 1)
      .map((d) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: d.path.coordinates },
        properties: { dayId: d.dayId, color: d.color },
      })),
  }), [dayPaths]);
```

- [ ] **Step 3: Terrain, atmosphere and route styling**

Import `Terrain, RasterDemSource, Atmosphere, MarkerView` from `@rnmapbox/maps`. Inside `<MapView>` directly after `<StyleImport … />` add:

```tsx
        <RasterDemSource id="terrain-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={514} maxZoomLevel={14}>
          <Terrain style={{ exaggeration: 1.3 }} />
        </RasterDemSource>
        <Atmosphere style={{ range: [0.8, 8], horizonBlend: 0.12, starIntensity: 0.12 }} />
```

Change the routes `ShapeSource` to `<ShapeSource id="trip-routes" shape={routesCollection} lineMetrics>` and the `LineLayer` style to a glowing route (a wide soft casing layer under a crisp line):

```tsx
            <LineLayer
              id="trip-routes-casing"
              style={{ lineColor: ['get', 'color'], lineWidth: 9, lineOpacity: 0.22, lineBlur: 4, lineCap: 'round', lineJoin: 'round' }}
            />
            <LineLayer
              id="trip-routes-line"
              aboveLayerID="trip-routes-casing"
              style={{ lineColor: ['get', 'color'], lineWidth: 3.5, lineOpacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
```

(The old traveled/upcoming dashing moves to the Planned | Actual view in Task 5.)

- [ ] **Step 4: Markers close in, dots at overview**

Track zoom: add `const [zoom, setZoom] = useState(INITIAL_ZOOM);` and on `<MapView>` add
`onCameraChanged={(s) => setZoom(s.properties.zoom)}`. Add the pure helper to `utils/tripRoutes.ts` **with its test** (append to Task 1's test file):

```ts
// utils/tripRoutes.ts
/** Native marker views are costly: shown only close in, and past 40 stops only for the selected day. */
export const MARKER_MIN_ZOOM = 11;
export const MARKER_MAX_COUNT = 40;
export function markerStops<T extends { dayId: string }>(zoom: number, stops: T[], selectedDayId: string | null): T[] {
  if (zoom < MARKER_MIN_ZOOM) return [];
  if (stops.length <= MARKER_MAX_COUNT) return stops;
  return selectedDayId ? stops.filter((s) => s.dayId === selectedDayId) : [];
}
```

```ts
// __tests__/utils/tripRoutes.test.ts  (add markerStops to the import)
describe('markerStops', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: `s${i}`, dayId: i < 5 ? 'd1' : 'd2' }));

  it('shows none at overview zoom', () => {
    expect(markerStops(10.9, many.slice(0, 3), null)).toEqual([]);
  });

  it('shows every stop close in when there are 40 or fewer', () => {
    expect(markerStops(11, many.slice(0, 40), null)).toHaveLength(40);
  });

  it('past 40, shows only the selected day, or none without a selection', () => {
    expect(markerStops(14, many, 'd1').map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(markerStops(14, many, null)).toEqual([]);
  });
});
```

Keep the existing `trip-stops` `ShapeSource` but give its `CircleLayer` `maxZoomLevel={MARKER_MIN_ZOOM}` and style it as solid day-coloured dots (`circleRadius: 6, circleColor: ['get','color'], circleStrokeWidth: 2, circleStrokeColor: '#ffffff'`); set the `pointsCollection` `color` property to the stop's `dayColor`. Then render markers when visible:

```tsx
        {markerStops(zoom, grounded, selected?.dayId ?? null).map((stop) => {
          const { Icon, color } = ACTIVITY_ICONS[stop.activity.type];
          return (
            <MarkerView key={stop.activity.id} coordinate={[stop.lng, stop.lat]} allowOverlap>
              <TouchableOpacity
                onPress={() => handleSelectStop(stop)}
                accessibilityLabel={`Stop ${stop.stopNumber}: ${stop.activity.title}`}
                style={styles.marker}
              >
                <StopStateBubble
                  Icon={Icon}
                  color={color}
                  visited={stop.visited}
                  isCurrent={stop.activity.id === currentActivityId}
                  bubbleSize={34}
                  iconSize={18}
                  surfaceColor={colors.background.elevated}
                />
                <View style={[styles.markerBadge, { backgroundColor: stop.dayColor }]}>
                  <Text style={styles.markerBadgeText}>{stop.stopNumber}</Text>
                </View>
              </TouchableOpacity>
            </MarkerView>
          );
        })}
```

`handleSelectStop(stop)` = Light haptic, `flyTo(stop.lng, stop.lat, 15.5)`, `setSelected(stop)` — reuse the logic the existing pin-press handler already runs for a matched stop (extract it into this `useCallback` and call it from both places). Styles:

```ts
  marker: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  markerBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#ffffff',
  },
  markerBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: FontWeight.bold },
```

- [ ] **Step 5: Tilted overview**

In `fitAllStops`, after `flyToBounds(...)`, nothing changes for bounds (flat overview is correct), but single-stop and stop-select fly-ins already pitch via `useFlyTo`. No further change.

- [ ] **Step 6: Verify**

Run: `npx jest --watchAll=false __tests__/utils/tripRoutes.test.ts && npx tsc --noEmit -p . && npx eslint components/trip/TripMapView.tsx 'app/trip/[id].tsx'`
Expected: tests pass; no type errors; no new lint errors.

On the simulator (per `ios-local-verification` memory, then shut it down per `close-simulator-when-done`): open a multi-day trip's map → terrain visible when tilted, roads followed after a moment (owner), markers appear past zoom 11, dots at overview.

- [ ] **Step 7: Commit**

```bash
git add components/trip/TripMapView.tsx 'app/trip/[id].tsx' utils/tripRoutes.ts __tests__/utils/tripRoutes.test.ts
git commit -m "feat: trip map with 3D terrain, real routes and stop markers"
```

### Task 4: The flyover

**Files:**
- Create: `utils/flyover.ts`
- Test: `__tests__/utils/flyover.test.ts`
- Modify: `components/trip/TripMapView.tsx`

**Interfaces:**
- Consumes: `dayPaths` (Task 3), `pointAlongPath` (Task 1).
- Produces:
  - `type FlyoverStatus = 'idle' | 'playing' | 'paused' | 'done'`
  - `interface FlyoverState { status: FlyoverStatus; dayIndex: number; progress: number }`
  - `type FlyoverAction = { type: 'play' } | { type: 'pause' } | { type: 'tick'; dt: number; durations: number[] } | { type: 'jump'; dayIndex: number } | { type: 'stop' }`
  - `flyoverReducer(state: FlyoverState, action: FlyoverAction): FlyoverState`
  - `dayDurationMs(meters: number): number`
  - `initialFlyover: FlyoverState`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/flyover.test.ts
import { flyoverReducer, dayDurationMs, initialFlyover } from '@/utils/flyover';

const durations = [4000, 6000];

describe('dayDurationMs', () => {
  it('scales with distance between 4 and 12 seconds', () => {
    expect(dayDurationMs(0)).toBe(4000);
    expect(dayDurationMs(10_000)).toBeGreaterThan(4000);
    expect(dayDurationMs(10_000_000)).toBe(12000);
  });
});

describe('flyoverReducer', () => {
  it('plays from the first day', () => {
    expect(flyoverReducer(initialFlyover, { type: 'play' })).toEqual({ status: 'playing', dayIndex: 0, progress: 0 });
  });

  it('advances progress by elapsed time over the day’s duration', () => {
    const s = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0 }, { type: 'tick', dt: 1000, durations });
    expect(s.progress).toBeCloseTo(0.25);
  });

  it('rolls into the next day, and finishes after the last', () => {
    const next = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0.9 }, { type: 'tick', dt: 1000, durations });
    expect(next).toEqual({ status: 'playing', dayIndex: 1, progress: 0 });
    const done = flyoverReducer({ status: 'playing', dayIndex: 1, progress: 0.95 }, { type: 'tick', dt: 1000, durations });
    expect(done).toEqual({ status: 'done', dayIndex: 1, progress: 1 });
  });

  it('ignores ticks while paused, and resumes where it stopped', () => {
    const paused = { status: 'paused' as const, dayIndex: 1, progress: 0.5 };
    expect(flyoverReducer(paused, { type: 'tick', dt: 1000, durations })).toBe(paused);
    expect(flyoverReducer(paused, { type: 'play' })).toEqual({ status: 'playing', dayIndex: 1, progress: 0.5 });
  });

  it('restarts from day one after finishing', () => {
    expect(flyoverReducer({ status: 'done', dayIndex: 1, progress: 1 }, { type: 'play' }))
      .toEqual({ status: 'playing', dayIndex: 0, progress: 0 });
  });

  it('jumps to a day at its start, and stops back to idle', () => {
    expect(flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0.3 }, { type: 'jump', dayIndex: 1 }))
      .toEqual({ status: 'playing', dayIndex: 1, progress: 0 });
    expect(flyoverReducer({ status: 'playing', dayIndex: 1, progress: 0.3 }, { type: 'stop' })).toEqual(initialFlyover);
  });

  it('skips a day with no route instead of stalling', () => {
    const s = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0 }, { type: 'tick', dt: 16, durations: [0, 6000] });
    expect(s.dayIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --watchAll=false __tests__/utils/flyover.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// utils/flyover.ts
/**
 * The trip map's day-by-day flyover as a pure state machine. The component
 * dispatches `tick` from requestAnimationFrame; everything about pacing,
 * rolling into the next day and finishing is decided here, where it's tested.
 */
export type FlyoverStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface FlyoverState {
  status: FlyoverStatus;
  dayIndex: number;
  /** 0 → 1 along the current day's path. */
  progress: number;
}

export type FlyoverAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[] }
  | { type: 'jump'; dayIndex: number }
  | { type: 'stop' };

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0 };

/** 4 s for a walkable day up to 12 s for a long drive — long enough to follow, short enough to finish. */
export function dayDurationMs(meters: number): number {
  return Math.round(Math.min(12_000, 4_000 + meters / 25));
}

export function flyoverReducer(state: FlyoverState, action: FlyoverAction): FlyoverState {
  switch (action.type) {
    case 'play':
      if (state.status === 'done' || state.status === 'idle') return { status: 'playing', dayIndex: 0, progress: 0 };
      return { ...state, status: 'playing' };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'stop':
      return initialFlyover;
    case 'jump':
      return { status: state.status === 'idle' || state.status === 'done' ? 'playing' : state.status, dayIndex: action.dayIndex, progress: 0 };
    case 'tick': {
      if (state.status !== 'playing') return state;
      const duration = action.durations[state.dayIndex] ?? 0;
      const progress = duration <= 0 ? 1 : state.progress + action.dt / duration;
      if (progress < 1) return { ...state, progress };
      const last = action.durations.length - 1;
      if (state.dayIndex >= last) return { status: 'done', dayIndex: state.dayIndex, progress: 1 };
      return { status: 'playing', dayIndex: state.dayIndex + 1, progress: 0 };
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --watchAll=false __tests__/utils/flyover.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `TripMapView`**

```tsx
  const [flyover, dispatch] = useReducer(flyoverReducer, initialFlyover);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); }, []);

  // A day with fewer than two stops has no path — duration 0, skipped.
  const durations = useMemo(
    () => dayPaths.map((d) => (d.path.coordinates.length > 1 ? dayDurationMs(d.path.meters) : 0)),
    [dayPaths],
  );

  // Clock: one tick per frame while playing.
  useEffect(() => {
    if (flyover.status !== 'playing') return;
    let frame = 0;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      dispatch({ type: 'tick', dt: now - last, durations });
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [flyover.status, durations]);

  // Camera follows the drawing head, ~3 times a second (smooth easeTo in between).
  useEffect(() => {
    if (flyover.status !== 'playing') return;
    const day = dayPaths[flyover.dayIndex];
    if (!day || day.path.coordinates.length < 2) return;
    const id = setInterval(() => {
      const { point, bearing } = pointAlongPath(day.path.coordinates, flyoverRef.current.progress);
      cameraRef.current?.setCamera({
        centerCoordinate: point, zoomLevel: 13.5, pitch: 62, heading: bearing,
        animationDuration: 350, animationMode: 'easeTo',
      });
    }, 350);
    return () => clearInterval(id);
  }, [flyover.status, flyover.dayIndex, dayPaths, cameraRef]);
```

with `const flyoverRef = useRef(flyover); flyoverRef.current = flyover;` above it. `handlePlay` = Light haptic; if `reduceMotion`, do nothing but `fitAllStops()` (routes are already fully drawn); else `dispatch({ type: flyover.status === 'playing' ? 'pause' : 'play' })`. When status becomes `'done'`, call `fitAllStops()` once (effect on `flyover.status`).

Drawing: while `flyover.status !== 'idle'`, render the routes from a second source so each day draws in turn. Replace the `trip-routes-line` style's opacity/trim with data from the day index:

```tsx
            <LineLayer
              id="trip-routes-line"
              aboveLayerID="trip-routes-casing"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: 3.5,
                lineCap: 'round',
                lineJoin: 'round',
                // Idle: every day fully drawn. Flyover: earlier days drawn,
                // the current day trimmed to the drawing head, later days hidden.
                lineOpacity: flyover.status === 'idle'
                  ? 0.95
                  : ['case', ['<=', ['get', 'dayIndex'], flyover.dayIndex], 0.95, 0],
              }}
            />
            {flyover.status !== 'idle' && dayPaths[flyover.dayIndex] ? (
              <LineLayer
                id="trip-routes-active"
                aboveLayerID="trip-routes-line"
                filter={['==', ['get', 'dayIndex'], flyover.dayIndex]}
                style={{
                  lineColor: '#ffffff',
                  lineWidth: 4.5,
                  lineCap: 'round',
                  lineTrimOffset: [Math.min(1, flyover.progress), 1],
                }}
              />
            ) : null}
```

and add `dayIndex` (position in `dayPaths`) to each route feature's properties. The effect: earlier days show in full colour, the current day shows in its colour with a white line growing along it (`lineTrimOffset: [progress, 1]` hides the not-yet-drawn part of the white line), and later days are hidden until reached. The `trip-routes` `ShapeSource` must keep `lineMetrics` (Task 3) — `lineTrimOffset` does nothing without it.

Stops spring in: while not idle, a marker for a stop in day `d` at index `i` renders only if `d < flyover.dayIndex || (d === flyover.dayIndex && dayPaths[d].path.stopFractions[i] <= flyover.progress)`; wrap its bubble in an `Animated.View` that springs `scale` 0.6 → 1 (house `SPRING`) on mount.

Bottom card while not idle: eyebrow `DAY {n} · {formatted day date}` (uppercase, 11pt, tracked, `colors.text.secondary`) and the most recently reached stop's title (17pt, `colors.text.primary`), on `colors.background.elevated`, radius 16, above the safe-area inset. Controls row: a 44pt play/pause button (`Play`/`Pause` Phosphor, `accessibilityLabel` "Play trip flyover"/"Pause"), day chips (`Day 1`…, active one filled with its day colour) dispatching `jump`, and a 44pt close button dispatching `stop`.

Place the **Play** entry button (Phosphor `Play`, label "Fly through your trip") in the header's right slot (replacing the empty spacer `View`), shown when at least one day has a path.

- [ ] **Step 6: Verify and commit**

Run: `npx jest --watchAll=false __tests__/utils && npx tsc --noEmit -p .`
Expected: all pass; no type errors.
Simulator: Play → day 1's route draws in white over its colour while the camera follows, tilted, heading along the route; stops pop in as reached; chips jump days; Reduce Motion (Settings → Accessibility) → Play just frames the trip. Shut the simulator down afterwards.

```bash
git add utils/flyover.ts __tests__/utils/flyover.test.ts components/trip/TripMapView.tsx
git commit -m "feat: day-by-day flyover that draws each route as the camera follows"
```

### Task 5: Planned | Actual and trip totals

**Files:**
- Modify: `utils/tripRoutes.ts`, `__tests__/utils/tripRoutes.test.ts`, `components/trip/TripMapView.tsx`

**Interfaces:**
- Consumes: `buildPath`, `RouteStop` (Task 1); flyover (Task 4).
- Produces:
  - `actualStopOrder<T extends { visited: boolean; visitedAt: { toMillis(): number } | null; order: number }>(days: { dayNumber: number; stops: T[] }[]): T[]`
  - `actualViewAvailable(input: { status: TripStatus; endDate: Date | null; anyVisited: boolean; now: Date }): boolean`

- [ ] **Step 1: Write the failing tests** (append to `__tests__/utils/tripRoutes.test.ts`)

```ts
import { actualStopOrder, actualViewAvailable } from '@/utils/tripRoutes';

describe('actualStopOrder', () => {
  const at = (ms: number) => ({ toMillis: () => ms });
  const s = (id: string, order: number, visitedAt: number | null) =>
    ({ id, order, visited: visitedAt !== null, visitedAt: visitedAt === null ? null : at(visitedAt) });

  it('keeps only visited stops, in the order they were visited', () => {
    const days = [
      { dayNumber: 1, stops: [s('a', 0, 300), s('b', 1000, 100), s('skip', 2000, null)] },
      { dayNumber: 2, stops: [s('c', 0, 200)] },
    ];
    expect(actualStopOrder(days).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks visitedAt ties by day, then by planned order', () => {
    const days = [
      { dayNumber: 2, stops: [s('late', 0, 100)] },
      { dayNumber: 1, stops: [s('second', 1000, 100), s('first', 0, 100)] },
    ];
    expect(actualStopOrder(days).map((x) => x.id)).toEqual(['first', 'second', 'late']);
  });
});

describe('actualViewAvailable', () => {
  const now = new Date(2026, 9, 1);
  it('appears once the trip is over or anything was visited', () => {
    expect(actualViewAvailable({ status: 'completed', endDate: null, anyVisited: false, now })).toBe(true);
    expect(actualViewAvailable({ status: 'planning', endDate: new Date(2026, 8, 20), anyVisited: false, now })).toBe(true);
    expect(actualViewAvailable({ status: 'active', endDate: new Date(2026, 9, 5), anyVisited: true, now })).toBe(true);
  });

  it('stays hidden for a future trip with nothing visited', () => {
    expect(actualViewAvailable({ status: 'planning', endDate: new Date(2026, 9, 20), anyVisited: false, now })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest --watchAll=false __tests__/utils/tripRoutes.test.ts`
Expected: FAIL — `actualStopOrder` is not exported.

- [ ] **Step 3: Implement** (append to `utils/tripRoutes.ts`)

```ts
import type { TripStatus } from '@/types';

/** Visited stops in the order they were checked off — the trip as actually taken. */
export function actualStopOrder<T extends { visited: boolean; visitedAt: { toMillis(): number } | null; order: number }>(
  days: { dayNumber: number; stops: T[] }[],
): T[] {
  const withDay = days.flatMap((d) => d.stops.filter((s) => s.visited && s.visitedAt).map((s) => ({ s, day: d.dayNumber })));
  withDay.sort((x, y) =>
    x.s.visitedAt!.toMillis() - y.s.visitedAt!.toMillis() || x.day - y.day || x.s.order - y.s.order);
  return withDay.map((x) => x.s);
}

/** Planned | Actual appears once there's something actual to show. */
export function actualViewAvailable(input: { status: TripStatus; endDate: Date | null; anyVisited: boolean; now: Date }): boolean {
  if (input.status === 'completed' || input.anyVisited) return true;
  return !!input.endDate && input.endDate.getTime() < input.now.getTime();
}
```

Merge the `TripStatus` import into the file's existing `import type { ActivityType } from '@/types';`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest --watchAll=false __tests__/utils/tripRoutes.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the view into `TripMapView`**

```tsx
  const [mapMode, setMapMode] = useState<'planned' | 'actual'>('planned');
  const showModeSwitch = actualViewAvailable({
    status: tripStatus, endDate: tripEndDate, anyVisited: grounded.some((g) => g.visited), now: new Date(),
  });

  const actualStops = useMemo(
    () => actualStopOrder(stopsByDay.map(([, stops]) => ({
      dayNumber: stops[0].dayNumber,
      stops: stops.map((g) => ({ ...g, visitedAt: g.activity.visitedAt, order: g.activity.order })),
    }))),
    [stopsByDay],
  );
  const actualPath = useMemo(() => buildPath(actualStops.map(toRouteStop), cache), [actualStops, cache]);
```

Add `actualPath.missing` to the `useTripRoutes` input: `const allMissing = useMemo(() => [...plannedMissing, ...buildPath(actualStops.map(toRouteStop), {}).missing], …)` so actual legs are fetched and cached too (shared keys dedupe naturally).

Rendering in `actual` mode: planned routes at `lineOpacity: 0.25`; a separate `ShapeSource id="trip-actual"` with one feature (`actualPath.coordinates`), `LineLayer` in brand pink `#f472b6`, width 4.5, with the same casing treatment; markers show only visited stops. The flyover in actual mode treats the actual path as a single "day" (`dayPaths` replaced by `[{ dayId: 'actual', color: '#f472b6', stops: actualStops, path: actualPath }]`).

Segmented control under the header when `showModeSwitch`: two 44pt-tall pills "Planned" / "Actual" on `colors.background.elevated`, the active one filled `colors.brand.purple` with `colors.text.inverse`; Light haptic; switching dispatches `stop` and refits.

Totals card (actual mode, shown at rest and when the actual flyover finishes): eyebrow `YOUR TRIP`, then three figures — `{km} km` from `actualPath.meters / 1000` (1 decimal under 10 km, else whole), `{n} stops`, `{d} days` (distinct `dayNumber`s among visited stops) — and a text link "See your recap" calling a new optional prop `onOpenRecap?: () => void` (wire it in `app/trip/[id].tsx` to whatever opens `TripRecapSheet` there).

- [ ] **Step 6: Verify and commit**

Run: `npx jest --watchAll=false && npx tsc --noEmit -p . && npm run lint`
Expected: all suites pass; no type errors; 0 lint errors.
Simulator: on a trip with a few stops marked visited, the switch appears; Actual draws the pink route over a faded plan; totals read correctly; Play replays the actual route. Shut the simulator down.

```bash
git add utils/tripRoutes.ts __tests__/utils/tripRoutes.test.ts components/trip/TripMapView.tsx 'app/trip/[id].tsx'
git commit -m "feat: planned vs actual trip on the map, with totals"
```

### Task 6: Ship to TestFlight

- [ ] **Step 1: Full check**

Run: `npx jest --watchAll=false && npx tsc --noEmit -p . && (cd functions && npx tsc --noEmit) && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 2: Update CLAUDE.md**

Under Utils add one line each for `utils/tripRoutes.ts` (leg modes, cache keys, arcs; "any new trip-map line must go through buildPath") and `utils/flyover.ts`; under Hooks add `useTripRoutes`; under Firestore collections add `trips/{tripId}/routes/cache`.

- [ ] **Step 3: Merge, push, build**

```bash
git switch main && git merge --no-ff feat/regions-comments-explore -m "merge: region names, comment keyboard, immersive trip map"
git push origin main
npx eas-cli build --profile production --platform ios --auto-submit --non-interactive --no-wait
```

Watch the submission (`npx eas-cli submit:list --platform ios --limit 1 --json`); if it sits `IN_QUEUE` over 20 minutes, resubmit with `npx eas-cli submit --platform ios --id <buildId> --non-interactive --no-wait`.
