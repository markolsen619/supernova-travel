# Globe POI Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Search tab's globe scannable — tappable places at every zoom, angled camera arrivals, and Supernova chrome instead of generic dark-glass.

**Architecture:** A curated trending-places layer (from public trips) renders below zoom 12; Mapbox Standard's ambient POI labels take over above ~z14. Tap resolution is fixed to Point geometry only, and a tap that still misses falls through to a Google Nearby Search so every tap resolves. Pure logic lives in `utils/` because this project has no React Native component-testing library.

**Tech Stack:** Expo Router v6, React Native 0.81, `@rnmapbox/maps` v10, TanStack Query v5, Zustand, Firestore, Jest (node environment, pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-08-28-globe-poi-discovery-design.md`

## Global Constraints

- **iOS ships first.** Android is deferred for *validation only* — never write an iOS-only code path. Every `BlurView` needs its `Platform.OS === 'ios' ? <BlurView> : <View>` solid fallback, matching the existing pattern in `app/(tabs)/search.tsx`.
- **This screen is always-dark** (Architecture Rule 3). Use `DarkColors` imported directly from `@/constants/colors`. Never call `useTheme()` here.
- **`StyleSheet.create` is module-level** and cannot read theme values. Dynamic colors go in inline styles only.
- **`useCallback` is required** for every event handler passed as a prop to a child component.
- **Use the `@/` path alias** for all imports.
- **Motion uses `SPRING` from `@/constants/motion`** — `tension: 65, friction: 11`. It is the only spring config in the app. Never introduce a damping/stiffness spring.
- **Haptics:** `Light` on navigation/selection, `Medium` on create/add/destructive.
- **Copy is sentence case.** No "please", no "simply", no exclamation marks. Errors say what happened and what to do.
- **No emoji.** Phosphor icons only.
- **Touch targets ≥ 44 pt.** Icon-only buttons need `accessibilityLabel`.
- **Tests are pure-function only.** There is no renderer available. Anything worth asserting must be pushed out of the component into `utils/` or `services/`.
- **Run `npx tsc --noEmit` before every commit.** The repo is currently clean; keep it that way.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `utils/camera.ts` | Pure camera math: pitch and heading per zoom |
| `utils/mapInteraction.ts` | Pure tap geometry: bbox, fallback gate, nearby radius |
| `utils/trendingPlaces.ts` | Pure aggregation of trip destinations into ranked pins |
| `hooks/useTrendingPlaces.ts` | One cached Firestore query → `TrendingPlace[]` |
| `components/search/GlobeMapView.tsx` | The map: layers, camera, tap handling |
| `__tests__/utils/camera.test.ts` | |
| `__tests__/utils/mapInteraction.test.ts` | |
| `__tests__/utils/trendingPlaces.test.ts` | |
| `__tests__/services/poiTapBridge.test.ts` | |

**Modify:**

| File | Change |
|---|---|
| `hooks/useFlyTo.ts` | Add pitch/heading; reset both in `flyToBounds` |
| `services/places/poiTapBridge.ts` | Point-only extraction, nearest-of-several |
| `services/places/googlePlaces.ts` | Add `searchNearbyPlaces()` |
| `app/(tabs)/search.tsx` | Extract map out; chrome, eyebrow, transition, sheet drag |

**Task order rationale:** pure logic first (no integration risk), then the refactor that keeps `search.tsx` manageable, then rendering, then chrome. The draggable sheet is last because it is the riskiest and can be dropped without losing anything else.

---

### Task 1: Angled camera arrivals

Delivers the thing that is most visibly wrong today: every fly-in lands straight down while `show3dBuildings` is on, so the 3D buildings are never seen.

**Files:**
- Create: `utils/camera.ts`
- Create: `__tests__/utils/camera.test.ts`
- Modify: `hooks/useFlyTo.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pitchForZoom(zoom: number): number`, `headingForArrival(lng: number): number`. `useFlyTo()` keeps its existing return shape `{ cameraRef, flyTo, flyToBounds }` — `flyTo(lng, lat, zoom, durationMs?)` and `flyToBounds(ne, sw, durationMs?)` signatures are unchanged, so no call site needs editing.

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/camera.test.ts`:

```ts
import { pitchForZoom, headingForArrival } from '@/utils/camera';

describe('pitchForZoom', () => {
  it('is flat below zoom 8, where pitch would distort the globe', () => {
    expect(pitchForZoom(1.5)).toBe(0);
    expect(pitchForZoom(7.9)).toBe(0);
  });

  it('tilts moderately for city zooms', () => {
    expect(pitchForZoom(8)).toBe(45);
    expect(pitchForZoom(12.9)).toBe(45);
  });

  it('tilts hardest at POI zoom, where 3D buildings become visible', () => {
    expect(pitchForZoom(13)).toBe(55);
    expect(pitchForZoom(18)).toBe(55);
  });

  it('treats band edges as inclusive lower bounds', () => {
    // Guards the off-by-one: 8 and 13 belong to the HIGHER band.
    expect(pitchForZoom(8)).not.toBe(0);
    expect(pitchForZoom(13)).not.toBe(45);
  });

  it('never returns a pitch Mapbox would reject', () => {
    [0, 1, 5, 8, 10, 13, 16, 22].forEach((z) => {
      expect(pitchForZoom(z)).toBeGreaterThanOrEqual(0);
      expect(pitchForZoom(z)).toBeLessThanOrEqual(60);
    });
  });
});

describe('headingForArrival', () => {
  it('is deterministic — the same place always looks the same', () => {
    expect(headingForArrival(2.3522)).toBe(headingForArrival(2.3522));
  });

  it('varies between different places, so arrivals are not all identical', () => {
    expect(headingForArrival(2.3522)).not.toBe(headingForArrival(139.6917));
  });

  it('stays within a subtle range', () => {
    [-180, -74, 0, 2.35, 139.69, 180].forEach((lng) => {
      expect(Math.abs(headingForArrival(lng))).toBeLessThanOrEqual(25);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/camera.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '@/utils/camera'`

- [ ] **Step 3: Write the implementation**

Create `utils/camera.ts`:

```ts
/**
 * Camera geometry for the globe. Pure so the zoom bands and their exact
 * boundaries are testable without a map instance.
 */

/** Below this, the globe is the subject and any tilt distorts it. */
const FLAT_BELOW_ZOOM = 8;
/** At and above this, 3D buildings are rendered and worth looking at. */
const STEEP_FROM_ZOOM = 13;

/**
 * Camera pitch for a target zoom.
 *
 * The whole point: `StyleImport` sets `show3dBuildings: true`, but a pitch-0
 * camera looks straight down, where 3D is invisible. Tilting at close zoom is
 * the only way that setting produces anything.
 */
export function pitchForZoom(zoom: number): number {
  if (zoom < FLAT_BELOW_ZOOM) return 0;
  if (zoom < STEEP_FROM_ZOOM) return 45;
  return 55;
}

/**
 * A small bearing offset so arrivals are not all mechanically north-locked.
 *
 * Derived from longitude rather than randomised: revisiting the same place
 * must frame it the same way, or the map feels unstable.
 */
export function headingForArrival(lng: number): number {
  // Longitude is already well distributed across the globe; folding it to a
  // ±25° band gives variety without ever looking crooked.
  const folded = ((Math.abs(lng) * 7) % 50) - 25;
  return Math.round(folded);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/camera.test.ts --watchAll=false`
Expected: PASS, 8 tests

- [ ] **Step 5: Wire pitch and heading into `useFlyTo`**

Replace the body of `hooks/useFlyTo.ts` between the imports and the `return`:

```ts
import { useRef, useCallback } from 'react';
import { Camera } from '@rnmapbox/maps';
import { pitchForZoom, headingForArrival } from '@/utils/camera';

export type CameraHandle = React.ElementRef<typeof Camera>;

const DEFAULT_DURATION_MS = 1200;
// Screen-point padding around a fitted bounds box, so the region isn't
// framed edge-to-edge against the device chrome/search bar.
const BOUNDS_PADDING = 60;

export function useFlyTo() {
  const cameraRef = useRef<CameraHandle>(null);

  // Point + zoom case. zoom is required — callers should always derive it via
  // zoomForPlaceType() (or use flyToBounds when a viewport is available), so a
  // missing zoom is a bug at the call site, not something to silently default.
  const flyTo = useCallback(
    (lng: number, lat: number, zoom: number, durationMs = DEFAULT_DURATION_MS) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: zoom,
        pitch: pitchForZoom(zoom),
        heading: headingForArrival(lng),
        animationDuration: durationMs,
        animationMode: 'flyTo',
      });
    },
    [],
  );

  // Bounds-fitting case — preferred over flyTo whenever Google gives us a
  // viewport (regions: country/administrative_area/locality), since a fitted
  // box frames the place far more correctly than a guessed zoom level.
  //
  // ONE camera stop, carrying bounds and pitch and heading together — NOT a
  // pitch reset followed by fitBounds. fitBounds is itself a thin wrapper that
  // calls setCamera({ type: 'CameraStop', bounds, padding }), so issuing both
  // in the same tick means the second stop preempts the first, and because a
  // CameraStop leaves omitted fields at their current value, the pitch reset
  // never lands. A region arrived at straight after a tilted POI would stay
  // crooked — the exact bug the reset exists to prevent, and one that only
  // shows on the SECOND navigation, never the first.
  const flyToBounds = useCallback(
    (ne: [number, number], sw: [number, number], durationMs = DEFAULT_DURATION_MS) => {
      cameraRef.current?.setCamera({
        bounds: { ne, sw },
        padding: {
          paddingTop: BOUNDS_PADDING,
          paddingBottom: BOUNDS_PADDING,
          paddingLeft: BOUNDS_PADDING,
          paddingRight: BOUNDS_PADDING,
        },
        pitch: 0,
        heading: 0,
        animationDuration: durationMs,
        animationMode: 'flyTo',
      });
    },
    [],
  );

  return { cameraRef, flyTo, flyToBounds };
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 7: Commit**

```bash
git add utils/camera.ts __tests__/utils/camera.test.ts hooks/useFlyTo.ts
git commit -m "feat: angled camera arrivals on the globe

Every fly-in landed at pitch 0 while show3dBuildings was switched on, so
the 3D buildings were rendered and then viewed from directly overhead,
where 3D is invisible. Pitch now scales with zoom: flat below z8 so the
globe is not distorted, 45 for cities, 55 at POI zoom.

flyToBounds explicitly resets pitch and heading first — fitBounds does not
touch either, so a region arrived at from a tilted POI would otherwise be
framed crooked."
```

---

### Task 2: Point-only POI extraction

Today `extractPoiFromFeatures` returns the first feature carrying any `name`, and falls back to the tap coordinates when the geometry is not a Point. Rendered features at a tap include water, landuse, admin polygons and road lines — all named. So a near-miss can resolve "Pacific Ocean" and then fire a **billed** Google Text Search on it.

Oceans and landuse are polygons. Roads are lines. Only labels are points. Requiring Point geometry removes the entire bug class.

**Files:**
- Modify: `services/places/poiTapBridge.ts`
- Create: `__tests__/services/poiTapBridge.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractPoiFromFeatures(collection, tapLat, tapLng): TappedPoi | null` — same signature as today. `tapLat`/`tapLng` change meaning: they are now the reference point for choosing the *nearest* candidate, no longer a coordinate fallback. `TappedPoi` is unchanged: `{ name, lat, lng, cacheKey }`.

**Both callers inherit this automatically** — `app/(tabs)/search.tsx:227` and `hooks/usePoiTapResolver.ts:38` (used by `TripMapView`). Neither needs editing in this task.

- [ ] **Step 1: Write the failing test**

Create `__tests__/services/poiTapBridge.test.ts`:

```ts
import type * as GeoJSON from 'geojson';
import { extractPoiFromFeatures, makeCacheKey } from '@/services/places/poiTapBridge';

function point(name: string, lng: number, lat: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

function polygon(name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
  };
}

function line(name: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  };
}

function collection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('extractPoiFromFeatures', () => {
  it('returns a named Point feature', () => {
    const poi = extractPoiFromFeatures(collection([point('Louvre', 2.3376, 48.8606)]), 48.8606, 2.3376);
    expect(poi?.name).toBe('Louvre');
    expect(poi?.lat).toBeCloseTo(48.8606);
    expect(poi?.lng).toBeCloseTo(2.3376);
  });

  // The bug this task exists to kill: a named polygon used to win and then
  // get sent to a billed Text Search.
  it('rejects a named polygon, such as an ocean or landuse area', () => {
    expect(extractPoiFromFeatures(collection([polygon('Pacific Ocean')]), 0, 0)).toBeNull();
  });

  it('rejects a named line, such as a road', () => {
    expect(extractPoiFromFeatures(collection([line('Rue de Rivoli')]), 0, 0)).toBeNull();
  });

  it('skips polygons and lines to reach a real Point behind them', () => {
    const poi = extractPoiFromFeatures(
      collection([polygon('Seine'), line('Rue de Rivoli'), point('Louvre', 2.3376, 48.8606)]),
      48.8606,
      2.3376,
    );
    expect(poi?.name).toBe('Louvre');
  });

  it('chooses the Point nearest the tap, not merely the first', () => {
    const poi = extractPoiFromFeatures(
      collection([point('Far Cafe', 2.4, 48.9), point('Near Cafe', 2.3377, 48.8607)]),
      48.8606,
      2.3376,
    );
    expect(poi?.name).toBe('Near Cafe');
  });

  it('skips unnamed Point features', () => {
    const unnamed: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [2.3376, 48.8606] },
    };
    expect(extractPoiFromFeatures(collection([unnamed]), 48.8606, 2.3376)).toBeNull();
  });

  it('prefers name_en when both are present', () => {
    const bilingual: GeoJSON.Feature = {
      type: 'Feature',
      properties: { name: 'Louvre', name_en: 'The Louvre' },
      geometry: { type: 'Point', coordinates: [2.3376, 48.8606] },
    };
    expect(extractPoiFromFeatures(collection([bilingual]), 48.8606, 2.3376)?.name).toBe('The Louvre');
  });

  it('returns null for an empty or missing collection', () => {
    expect(extractPoiFromFeatures(collection([]), 0, 0)).toBeNull();
    expect(extractPoiFromFeatures(undefined, 0, 0)).toBeNull();
  });
});

describe('makeCacheKey', () => {
  it('is stable for the same place', () => {
    expect(makeCacheKey('Louvre', 48.8606, 2.3376)).toBe(makeCacheKey('Louvre', 48.8606, 2.3376));
  });

  it('is case-insensitive on the name', () => {
    expect(makeCacheKey('LOUVRE', 48.8606, 2.3376)).toBe(makeCacheKey('louvre', 48.8606, 2.3376));
  });

  it('separates two different places', () => {
    expect(makeCacheKey('Louvre', 48.8606, 2.3376)).not.toBe(makeCacheKey('Louvre', 40.0, 2.3376));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/services/poiTapBridge.test.ts --watchAll=false`
Expected: FAIL — the polygon and line tests return a POI instead of null, and the nearest-of-several test returns "Far Cafe".

- [ ] **Step 3: Rewrite the extraction**

Replace `extractPoiFromFeatures` in `services/places/poiTapBridge.ts` (keep the imports, `TappedPoi`, `roundCoord` and `makeCacheKey` exactly as they are):

```ts
/** Squared degree distance — ordering only, so no need for a real projection. */
function distanceSq(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = aLat - bLat;
  const dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng;
}

function nameOf(feature: GeoJSON.Feature): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  return (
    (props['name_en'] as string | undefined) ??
    (props['name'] as string | undefined) ??
    (props['title'] as string | undefined) ??
    ''
  );
}

/**
 * Extracts the POI nearest a tap from a queryRenderedFeatures result.
 *
 * Point geometry is REQUIRED, not preferred. Mapbox returns everything drawn
 * under the tap — water and landuse polygons, road lines, admin boundaries —
 * and all of them carry names. The previous implementation took the first
 * named feature of any geometry and fell back to the tap coordinates, so a
 * near-miss could resolve "Pacific Ocean" and then spend a billed Google Text
 * Search resolving it. Only labels are Points, so this single constraint
 * removes that entire class of failure.
 *
 * tapLat/tapLng are the reference point for choosing between several
 * candidates — never a coordinate fallback.
 */
export function extractPoiFromFeatures(
  collection: GeoJSON.FeatureCollection | undefined,
  tapLat: number,
  tapLng: number,
): TappedPoi | null {
  if (!collection || collection.features.length === 0) return null;

  let best: TappedPoi | null = null;
  let bestDistance = Infinity;

  for (const feature of collection.features) {
    if (feature.geometry?.type !== 'Point') continue;

    const name = nameOf(feature);
    if (!name) continue;

    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const d = distanceSq(lat, lng, tapLat, tapLng);
    if (d < bestDistance) {
      bestDistance = d;
      best = { name, lat, lng, cacheKey: makeCacheKey(name, lat, lng) };
    }
  }

  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/services/poiTapBridge.test.ts --watchAll=false`
Expected: PASS, 12 tests

- [ ] **Step 5: Run the full suite — two callers depend on this**

Run: `npx jest --watchAll=false`
Expected: PASS. Confirms nothing that used the old fallback-to-tap-coords behaviour has broken.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 7: Commit**

```bash
git add services/places/poiTapBridge.ts __tests__/services/poiTapBridge.test.ts
git commit -m "fix: only resolve Point features on a POI tap

extractPoiFromFeatures took the first feature carrying any name and fell
back to the tap coordinates when geometry was not a Point. Mapbox returns
everything drawn under the tap — water and landuse polygons, road lines,
admin boundaries — and all of them are named, so a near-miss could resolve
'Pacific Ocean' and then spend a billed Text Search on it.

Only labels are Points. Requiring Point geometry removes the whole class,
and where several candidates overlap the nearest to the tap now wins rather
than whichever Mapbox happened to return first.

Both callers inherit the fix: the search globe and usePoiTapResolver, which
backs TripMapView."
```

---

### Task 3: Tap geometry helpers and a forgiving hit area

A single-pixel query demands pixel-perfect tapping. This widens it to half the 44 pt accessibility target and adds the pure helpers the fallback in Task 4 needs.

**Files:**
- Create: `utils/mapInteraction.ts`
- Create: `__tests__/utils/mapInteraction.test.ts`
- Modify: `app/(tabs)/search.tsx` (the `handleMapPress` query call only)
- Modify: `hooks/usePoiTapResolver.ts` (the same query call)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tapBbox(x: number, y: number, radius?: number): [number, number, number, number]` — returns `[top, left, bottom, right]`.
  - `shouldFallbackToNearby(zoom: number): boolean`
  - `nearbyRadiusForZoom(zoom: number): number` — metres.
  - `TAP_RADIUS_PT = 22`

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/mapInteraction.test.ts`:

```ts
import {
  tapBbox,
  shouldFallbackToNearby,
  nearbyRadiusForZoom,
  TAP_RADIUS_PT,
} from '@/utils/mapInteraction';

describe('tapBbox', () => {
  // rnmapbox takes [top, left, bottom, right] — NOT the [minX, minY, maxX,
  // maxY] most bbox APIs use. Inverting it returns an empty collection with
  // no error, which looks exactly like "no POI here".
  it('emits [top, left, bottom, right] in that order', () => {
    const [top, left, bottom, right] = tapBbox(100, 200, 10);
    expect(top).toBe(190);
    expect(left).toBe(90);
    expect(bottom).toBe(210);
    expect(right).toBe(110);
  });

  it('defaults to half the 44pt touch target', () => {
    expect(TAP_RADIUS_PT).toBe(22);
    const [top, , bottom] = tapBbox(100, 200);
    expect(bottom - top).toBe(44);
  });

  it('never emits negative coordinates near a screen edge', () => {
    const [top, left] = tapBbox(5, 5, 22);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});

describe('shouldFallbackToNearby', () => {
  it('is false at globe zoom, where a tap spans hundreds of kilometres', () => {
    expect(shouldFallbackToNearby(1.5)).toBe(false);
    expect(shouldFallbackToNearby(12)).toBe(false);
  });

  it('is true once zoomed in enough for a nearby lookup to mean something', () => {
    expect(shouldFallbackToNearby(12.1)).toBe(true);
    expect(shouldFallbackToNearby(18)).toBe(true);
  });
});

describe('nearbyRadiusForZoom', () => {
  it('tightens as the user zooms in', () => {
    expect(nearbyRadiusForZoom(13)).toBeGreaterThan(nearbyRadiusForZoom(16));
  });

  it('stays within the bounds Google accepts', () => {
    [13, 14, 15, 16, 17, 18, 20].forEach((z) => {
      expect(nearbyRadiusForZoom(z)).toBeGreaterThanOrEqual(50);
      expect(nearbyRadiusForZoom(z)).toBeLessThanOrEqual(50000);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/mapInteraction.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '@/utils/mapInteraction'`

- [ ] **Step 3: Write the implementation**

Create `utils/mapInteraction.ts`:

```ts
/**
 * Pure geometry for map tap handling. Separate from the components so the
 * bbox argument order and the fallback thresholds are testable.
 */

/** Half of the 44 pt accessibility touch target. */
export const TAP_RADIUS_PT = 22;

/** Below this zoom a tap covers too much ground for a nearby lookup to mean anything. */
const NEARBY_MIN_ZOOM = 12;

/**
 * A square hit area around a tap, in the order rnmapbox expects.
 *
 * `queryRenderedFeaturesInRect` takes `[top, left, bottom, right]`, NOT the
 * `[minX, minY, maxX, maxY]` most bbox APIs use. Getting it backwards returns
 * an empty collection with no error — indistinguishable from "no POI here" —
 * so the order is stated once, here, and never inline at a call site.
 */
export function tapBbox(
  x: number,
  y: number,
  radius: number = TAP_RADIUS_PT,
): [number, number, number, number] {
  return [
    Math.max(0, y - radius), // top
    Math.max(0, x - radius), // left
    y + radius,              // bottom
    x + radius,              // right
  ];
}

/**
 * Whether a tap that hit no rendered POI should fall through to a Nearby
 * Search. Below the threshold a tap spans hundreds of kilometres, so any
 * result would be arbitrary — and billed. Fly in instead.
 */
export function shouldFallbackToNearby(zoom: number): boolean {
  return zoom > NEARBY_MIN_ZOOM;
}

/**
 * Search radius in metres, proportional to what the user can actually see.
 * Roughly halves per zoom level, clamped to a range Google accepts.
 */
export function nearbyRadiusForZoom(zoom: number): number {
  const metres = 500 * Math.pow(2, 13 - zoom);
  return Math.round(Math.min(50000, Math.max(50, metres)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/mapInteraction.test.ts --watchAll=false`
Expected: PASS, 8 tests

- [ ] **Step 5: Widen the hit area in `app/(tabs)/search.tsx`**

In `handleMapPress`, replace the `queryRenderedFeaturesAtPoint` call:

```ts
      const collection = await mapRef.current?.queryRenderedFeaturesInRect(
        tapBbox(screenPointX, screenPointY),
      );
```

Add the import:

```ts
import { tapBbox } from '@/utils/mapInteraction';
```

- [ ] **Step 6: Widen the hit area in `hooks/usePoiTapResolver.ts`**

Apply the identical change at its `queryRenderedFeaturesAtPoint` call (line ~34), with the same import. This keeps `TripMapView`'s tap behaviour consistent with the globe's — two different hit areas for the same gesture would be a bug users could feel.

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest --watchAll=false`
Expected: no tsc output; all tests pass

- [ ] **Step 8: Commit**

```bash
git add utils/mapInteraction.ts __tests__/utils/mapInteraction.test.ts "app/(tabs)/search.tsx" hooks/usePoiTapResolver.ts
git commit -m "feat: forgiving hit area for map taps

A single-pixel queryRenderedFeaturesAtPoint demanded pixel-perfect tapping
on a label. Both tap paths now query a 44pt box — the accessibility touch
target — via queryRenderedFeaturesInRect.

The bbox order lives in one tested helper because rnmapbox takes [top, left,
bottom, right] rather than the usual [minX, minY, maxX, maxY], and getting
it backwards returns an empty collection with no error, which is
indistinguishable from finding nothing."
```

---

### Task 4: Nearby Search service

The service call the tap-anywhere fallback needs. Landed separately so it can be reviewed as an API integration before anything depends on it.

**Files:**
- Modify: `services/places/googlePlaces.ts`

**Interfaces:**
- Consumes: `nearbyRadiusForZoom` from Task 3 (used by the caller, not here).
- Produces: `searchNearbyPlaces(lat: number, lng: number, radiusM: number, maxResults?: number): Promise<EnrichedPlace[]>` — ordered nearest-first, `[]` on any failure.

- [ ] **Step 1: Add the function**

Append to `services/places/googlePlaces.ts`, directly after `enrichPoiByNameAndCoords`:

```ts
/**
 * Tap-anywhere fallback — what is physically near these coordinates?
 *
 * Mapbox Standard declutters labels aggressively, so most POIs it knows about
 * are never drawn and therefore never tappable. When a tap finds no rendered
 * feature, this answers "what is actually here?" instead of the map appearing
 * broken.
 *
 * Uses `places:searchNearby` rather than the shared textSearchFirstResult
 * helper: that helper hits `places:searchText` and returns a single result,
 * and here there is no text to search for and several results are wanted.
 * Same API key, same TIER2 mask, same error posture.
 *
 * Call ONLY on a tap that found nothing, and only above the zoom gate — see
 * shouldFallbackToNearby(). Every call is billed.
 */
export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radiusM: number,
  maxResults = 5,
): Promise<EnrichedPlace[]> {
  // Clamped here, not only in nearbyRadiusForZoom. This function is exported
  // and every call is billed, so it defends itself rather than trusting each
  // caller to have clamped first. Google's own limits: radius 0-50000m,
  // maxResultCount 1-20 — exceeding either is a 400, i.e. a wasted round trip.
  const radius = Math.min(50000, Math.max(1, radiusM));
  const count = Math.min(20, Math.max(1, Math.trunc(maxResults)));

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': TIER2_LIST_FIELD_MASK,
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
        maxResultCount: count,
        rankPreference: 'DISTANCE',
        languageCode: 'en',
      }),
    });

    if (!res.ok) {
      console.error('[searchNearbyPlaces] HTTP', res.status, await res.text());
      return [];
    }

    const json = (await res.json()) as { places?: RawTier2Place[] };
    const places = json.places ?? [];

    return places.map((place) => {
      const components = place.addressComponents ?? [];
      return {
        placeId: place.id ?? '',
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
        lat: place.location?.latitude ?? lat,
        lng: place.location?.longitude ?? lng,
        countryCode: components.find((c) => c.types.includes('country'))?.shortText ?? null,
        tier: 'tier2' as const,
        ...tier2FieldsFromRaw(place),
      };
    });
  } catch (error) {
    // Offline or DNS failure. An empty list renders the honest "no places
    // found here" state, which is the right outcome either way.
    console.error('[searchNearbyPlaces] failed', error);
    return [];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If `TIER2_LIST_FIELD_MASK` or `RawTier2Place` are not in scope at the insertion point, move the function below their declarations rather than exporting them.

- [ ] **Step 3: Commit**

```bash
git add services/places/googlePlaces.ts
git commit -m "feat: add searchNearbyPlaces for the tap-anywhere fallback

Nearby Search ranked by distance, for answering 'what is actually here?'
when a tap finds no rendered Mapbox feature. Returns an empty list rather
than throwing on any failure, since the caller's empty state is the right
outcome for both no-results and offline."
```

---

### Task 5: Every tap resolves, and every tap is acknowledged

Two changes to the same handler. Today a tap that misses does `console.log` then a bare `return` — no haptic, no marker, no message. That silence is what makes the map feel broken rather than empty.

**Files:**
- Modify: `app/(tabs)/search.tsx`

**Interfaces:**
- Consumes: `shouldFallbackToNearby`, `nearbyRadiusForZoom` (Task 3), `searchNearbyPlaces` (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add imports and nearby state**

```ts
import { tapBbox, shouldFallbackToNearby, nearbyRadiusForZoom } from '@/utils/mapInteraction';
import { searchNearbyPlaces } from '@/services/places/googlePlaces';
import { SPRING, Duration, fadeTo } from '@/constants/motion';
```

`SPRING` is likely already imported; add only what is missing.

Alongside the existing `useState` declarations:

```ts
  // Results of a tap that hit no rendered POI. Rendered in the sheet under
  // "Places near here" — reusing PlaceResult rows rather than a new chooser.
  const [nearbyResults, setNearbyResults] = useState<EnrichedPlace[] | null>(null);
  // Live zoom, kept in a ref because onCameraChanged fires continuously
  // through a pinch — see Task 9 for why this must not be state.
  const zoomRef = useRef(INITIAL_ZOOM);
```

- [ ] **Step 2: Move the haptic to the top of `handleMapPress`**

The haptic currently fires only after resolution succeeds, so a hit feels delayed by a network call and a miss feels like nothing happened. Make it the first statement in the handler, before the `queryRenderedFeaturesInRect` await:

```ts
    async (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => {
      const { screenPointX, screenPointY } = feature.properties;
      const [tapLng, tapLat] = feature.geometry.coordinates;

      // Acknowledge the tap in the same frame it happens, before any await.
      // Whether it resolves to a POI, to nearby results, or to nothing, the
      // user must never wonder if the tap registered.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
```

Then **delete** the later `Haptics.impactAsync(...)` line that sits just after the `if (!poi)` block, so the tap does not buzz twice.

- [ ] **Step 3: Replace the silent miss path**

Replace the whole `if (!poi) { ... return; }` block:

```ts
      if (!poi) {
        const zoom = zoomRef.current;

        // Below the gate a tap covers hundreds of kilometres, so any nearby
        // result would be arbitrary — and billed. Flying in is the useful
        // reading of a tap on a far-out map.
        if (!shouldFallbackToNearby(zoom)) {
          flyTo(tapLng, tapLat, Math.min(zoom + 3, 12.5));
          return;
        }

        setEnriching(true);
        try {
          const nearby = await searchNearbyPlaces(
            tapLat,
            tapLng,
            nearbyRadiusForZoom(zoom),
          );

          if (nearby.length === 1) {
            // One obvious answer — skip the list and select it directly.
            // Clear any nearby list from a PREVIOUS tap first: without this,
            // a multi-result tap followed by a single-result tap leaves both
            // sheets mounted, and dismissing the detail sheet reveals a stale
            // list from two taps ago.
            setNearbyResults(null);
            setPlace(nearby[0]);
            setSelectedPlace(nearby[0]);
            flyToPlace(nearby[0]);
            showSheet();
            return;
          }

          // Zero results still opens the sheet: an honest empty state beats
          // the silence this branch used to produce.
          nearby.forEach((p) => setPlace(p));
          setNearbyResults(nearby);
          setSelectedPlace(null);
          showSheet();
        } finally {
          setEnriching(false);
        }
        return;
      }

      // A real POI was found — drop any stale nearby list.
      setNearbyResults(null);
```

Add `flyTo` and `setNearbyResults` to the `useCallback` dependency array.

- [ ] **Step 3b: Add the visual tap pulse**

A haptic alone is not enough. `expo-haptics` maps to a coarser vibration on
Android, and on a silent-switched iPhone some feedback is suppressed entirely —
so the acknowledgement has to be visible, not just felt.

State and animated values:

```ts
  // Screen point of the last tap, for the pulse. Null when no pulse is running.
  const [pulseAt, setPulseAt] = useState<{ x: number; y: number } | null>(null);
  const pulseScale = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
```

Handler, called from the top of `handleMapPress` immediately after the haptic:

```ts
  const firePulse = useCallback(
    (x: number, y: number) => {
      setPulseAt({ x, y });
      pulseScale.setValue(0);
      pulseOpacity.setValue(0.5);
      Animated.parallel([
        Animated.spring(pulseScale, { toValue: 1, ...SPRING }),
        fadeTo(pulseOpacity, 0, Duration.base),
      ]).start(() => setPulseAt(null));
    },
    [pulseScale, pulseOpacity],
  );
```

In `handleMapPress`, directly under the haptic:

```ts
      firePulse(screenPointX, screenPointY);
```

Add `firePulse` to the handler's dependency array.

Render, after the map and before the search bar:

```tsx
      {pulseAt && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tapPulse,
            {
              left: pulseAt.x - 22,
              top: pulseAt.y - 22,
              borderColor: colors.brand.purple,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      )}
```

```ts
  tapPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
  },
```

The 44 pt diameter deliberately matches the hit area from `tapBbox`, so the
pulse shows the user exactly how forgiving the tap actually was.

- [ ] **Step 3c: Let the sheet mount without a query**

The results sheet is gated on `showingQuery` (`query.length > 0 && !selectedPlace`).
A nearby-results miss never sets `query`, so under that gate the sheet would
never mount and the fallback would silently show nothing — reproducing the exact
bug this task exists to fix.

Add a second flag and gate only the sheet on it. The tabs keep using
`showingQuery`, since a tab row over a tap-driven result list has nothing to
switch between:

```ts
  const showingQuery = query.length > 0 && !selectedPlace;
  // A nearby-results miss has no query text, so it can't ride showingQuery.
  const showingSheet = showingQuery || nearbyResults !== null;
```

Also reset the active tab when nearby results arrive. `handleClearQuery` does
not reset `activeTab`, so a user who searched, switched to Users, then cleared
and tapped the map would land on `renderUsers()` — an empty state covering real
results sitting in `nearbyResults`:

```ts
      setActiveTab('Places');
```

Set it alongside `setNearbyResults(nearby)` in the miss branch.

- [ ] **Step 4: Render the nearby results in the sheet**

In `renderPlaces()`, before the existing `if (!query.trim())` line:

```ts
    // A tap that fell through to Nearby Search owns the sheet until the user
    // searches or selects — checked before the query-empty branch, which
    // would otherwise show "Search the map" over real results.
    if (nearbyResults !== null) {
      if (nearbyResults.length === 0) {
        return renderEmptyState(
          MapPin,
          'No places found here',
          'Try tapping closer to a building or label.',
        );
      }
      return (
        <>
          <Text style={[styles.sheetHeading, { color: colors.text.tertiary }]}>
            PLACES NEAR HERE
          </Text>
          {nearbyResults.map((p) => (
            <PlaceResult
              key={p.placeId}
              placeId={p.placeId}
              mainText={p.name}
              secondaryText={p.address}
              onPress={handleNearbyPress}
              colors={DarkColors}
            />
          ))}
        </>
      );
    }
```

Import `MapPin` from `phosphor-react-native` alongside the existing icons.

- [ ] **Step 5: Add the nearby selection handler**

Nearby results are already fully enriched, so this must NOT go through `handlePlacePress` — that would spend a second billed Details call re-fetching what is already cached:

```ts
  const handleNearbyPress = useCallback(
    (placeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const place = getPlace(placeId);
      if (!place) return;
      setNearbyResults(null);
      setSelectedPlace(place);
      flyToPlace(place);
      showSheet();
    },
    [getPlace, setSelectedPlace, flyToPlace, showSheet],
  );
```

- [ ] **Step 6: Clear nearby results when the user searches or resets**

In `handleQueryChange`, add `setNearbyResults(null)` as the first statement. In `handleClearQuery`, add it too — a stale nearby list must not survive a reset back to the globe.

- [ ] **Step 7: Add the heading style**

In the module-level `StyleSheet.create`:

```ts
  sheetHeading: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
```

- [ ] **Step 8: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest --watchAll=false`
Expected: no tsc output; all tests pass

- [ ] **Step 9: Commit**

```bash
git add "app/(tabs)/search.tsx"
git commit -m "feat: every map tap resolves to something

A tap that hit no rendered POI did console.log then returned — no haptic,
no message, nothing. Since Standard draws only a fraction of the POIs it
knows about, that silence was common, and it read as a broken map rather
than an empty one.

Above z12 a miss now falls through to Nearby Search and shows the closest
places in the existing sheet. Below it, the tap flies in instead, because
at that scale a nearby lookup spans hundreds of kilometres and would be
billed to return something arbitrary.

The haptic also moves to the first line of the handler, so a tap is
acknowledged in the frame it happens rather than after a network round
trip."
```

---

### Task 6: Trending places data

The curated layer's contents: destinations from public trips, deduped and ranked. One cached Firestore query, so panning and zooming the globe costs nothing.

**Files:**
- Create: `utils/trendingPlaces.ts`
- Create: `__tests__/utils/trendingPlaces.test.ts`
- Create: `hooks/useTrendingPlaces.ts`

**Interfaces:**
- Consumes: `Trip` and `Destination` from `@/types`.
- Produces:
  - `TrendingPlace` — `{ key, name, lat, lng, countryCode, placeId, tripCount, weight }` where `lat`/`lng` are `number` (never null — ungrounded destinations are dropped).
  - `aggregateDestinations(trips: Trip[], limit?: number): TrendingPlace[]`
  - `useTrendingPlaces(): { places: TrendingPlace[]; isLoading: boolean }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/trendingPlaces.test.ts`:

```ts
import type { Trip, Destination } from '@/types';
import { aggregateDestinations } from '@/utils/trendingPlaces';

function dest(over: Partial<Destination> = {}): Destination {
  return { name: 'Paris', placeId: 'p_paris', lat: 48.8566, lng: 2.3522, countryCode: 'FR', ...over };
}

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    destination: dest(),
    additionalDestinations: [],
    savesCount: 0,
    likesCount: 0,
    // Without this spread every test silently runs against the defaults,
    // ignoring its own arguments — the suite would look like it exercises
    // variation while asserting nothing of the kind.
    ...over,
  } as unknown as Trip;
}

describe('aggregateDestinations', () => {
  it('returns one entry per distinct place', () => {
    const out = aggregateDestinations([trip({ id: 'a' }), trip({ id: 'b' })]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Paris');
  });

  it('counts how many trips go to a place', () => {
    const out = aggregateDestinations([trip({ id: 'a' }), trip({ id: 'b' }), trip({ id: 'c' })]);
    expect(out[0].tripCount).toBe(3);
  });

  it('sums saves and likes into the weight', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', savesCount: 5, likesCount: 2 }),
      trip({ id: 'b', savesCount: 1, likesCount: 1 }),
    ]);
    expect(out[0].weight).toBe(9);
  });

  it('dedupes on placeId even when coordinates differ slightly', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ lat: 48.8566, lng: 2.3522 }) }),
      trip({ id: 'b', destination: dest({ lat: 48.8570, lng: 2.3530 }) }),
    ]);
    expect(out).toHaveLength(1);
  });

  // AI-generated trips can carry a name with no placeId until useTripCoverResolver
  // grounds them, so coordinates are the fallback identity.
  it('dedupes on rounded coordinates when placeId is null', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ placeId: null, lat: 48.85664, lng: 2.35221 }) }),
      trip({ id: 'b', destination: dest({ placeId: null, lat: 48.85661, lng: 2.35223 }) }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].tripCount).toBe(2);
  });

  it('drops destinations with no coordinates — they cannot be placed on a map', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ lat: null, lng: null, placeId: null }) }),
    ]);
    expect(out).toEqual([]);
  });

  it('includes additionalDestinations from multi-destination trips', () => {
    const out = aggregateDestinations([
      trip({
        id: 'a',
        additionalDestinations: [dest({ name: 'Lyon', placeId: 'p_lyon', lat: 45.76, lng: 4.83 })],
      }),
    ]);
    expect(out.map((p) => p.name).sort()).toEqual(['Lyon', 'Paris']);
  });

  it('sorts by weight, heaviest first', () => {
    const out = aggregateDestinations([
      trip({ id: 'a', destination: dest({ name: 'Paris', placeId: 'p_paris' }), savesCount: 1 }),
      trip({ id: 'b', destination: dest({ name: 'Tokyo', placeId: 'p_tokyo' }), savesCount: 99 }),
    ]);
    expect(out[0].name).toBe('Tokyo');
  });

  it('breaks ties deterministically so pins never reshuffle between renders', () => {
    const build = () =>
      aggregateDestinations([
        trip({ id: 'a', destination: dest({ name: 'Zurich', placeId: 'p_z' }), savesCount: 3 }),
        trip({ id: 'b', destination: dest({ name: 'Athens', placeId: 'p_a' }), savesCount: 3 }),
      ]);
    expect(build().map((p) => p.name)).toEqual(build().map((p) => p.name));
    expect(build()[0].name).toBe('Athens');
  });

  it('truncates to the limit, keeping the heaviest', () => {
    const trips = Array.from({ length: 60 }, (_, i) =>
      trip({ id: `t${i}`, destination: dest({ name: `City${i}`, placeId: `p${i}` }), savesCount: i }),
    );
    const out = aggregateDestinations(trips, 50);
    expect(out).toHaveLength(50);
    expect(out[0].name).toBe('City59');
  });

  it('returns an empty array for no trips', () => {
    expect(aggregateDestinations([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/trendingPlaces.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '@/utils/trendingPlaces'`

- [ ] **Step 3: Write the implementation**

Create `utils/trendingPlaces.ts`:

```ts
import type { Trip, Destination } from '@/types';

export interface TrendingPlace {
  /** placeId when present, else rounded coordinates. */
  key: string;
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  placeId: string | null;
  /** How many public trips go here. */
  tripCount: number;
  /** Summed savesCount + likesCount across those trips. */
  weight: number;
}

/** ~110 m. Close enough that two trips to the same city collapse. */
function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Identity for deduping. placeId is preferred, but AI-generated trips can
 * carry a destination name with no placeId until useTripCoverResolver grounds
 * them, so coordinates are the fallback.
 */
function identityFor(d: Destination): string | null {
  if (d.lat === null || d.lng === null) return null;
  if (d.placeId) return `id:${d.placeId}`;
  return `at:${roundCoord(d.lat)},${roundCoord(d.lng)}`;
}

/**
 * Public trip destinations -> ranked map pins.
 *
 * Pure so the dedupe rules, the weighting and the sort stability are testable
 * without Firestore. Sort stability matters more than it looks: an unstable
 * order makes pins visibly reshuffle between renders.
 */
export function aggregateDestinations(trips: Trip[], limit = 50): TrendingPlace[] {
  const byKey = new Map<string, TrendingPlace>();

  for (const trip of trips) {
    const destinations: Destination[] = [
      trip.destination,
      ...(trip.additionalDestinations ?? []),
    ].filter(Boolean);

    const tripWeight = (trip.savesCount ?? 0) + (trip.likesCount ?? 0);

    for (const d of destinations) {
      const key = identityFor(d);
      // No coordinates means it cannot be drawn. Skip rather than guess.
      if (!key) continue;

      const existing = byKey.get(key);
      if (existing) {
        existing.tripCount += 1;
        existing.weight += tripWeight;
        continue;
      }

      byKey.set(key, {
        key,
        name: d.name,
        lat: d.lat as number,
        lng: d.lng as number,
        countryCode: d.countryCode,
        placeId: d.placeId,
        tripCount: 1,
        weight: tripWeight,
      });
    }
  }

  return Array.from(byKey.values())
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.tripCount - a.tripCount ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/trendingPlaces.test.ts --watchAll=false`
Expected: PASS, 11 tests

- [ ] **Step 5: Write the hook**

Create `hooks/useTrendingPlaces.ts`:

```ts
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Trip } from '@/types';
import { aggregateDestinations, type TrendingPlace } from '@/utils/trendingPlaces';

/** Trips scanned before aggregation. Well above the 50 pins kept, so a
 *  popular destination reached by many trips still ranks correctly. */
const TRIP_SCAN_LIMIT = 150;

async function fetchTrendingTrips(): Promise<Trip[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'trips'),
        where('visibility', '==', 'public'),
        orderBy('savesCount', 'desc'),
        limit(TRIP_SCAN_LIMIT),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trip);
  } catch (error) {
    // This composite index (visibility ASC, savesCount DESC) may not exist
    // yet — Firestore throws failed-precondition with a console link. Degrade
    // to a globe with no trending pins rather than breaking the whole screen,
    // so the index stays a deployment step and not a blocker.
    console.warn('[useTrendingPlaces] query failed — rendering no trending pins:', error);
    return [];
  }
}

/**
 * Destinations to show on the globe at low zoom.
 *
 * One query, cached for ten minutes, independent of camera state: panning and
 * zooming the globe costs nothing. This is the whole reason the curated layer
 * is Firestore-backed rather than a viewport Places search.
 */
export function useTrendingPlaces(): { places: TrendingPlace[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['trendingPlaces'],
    queryFn: async (): Promise<TrendingPlace[]> =>
      aggregateDestinations(await fetchTrendingTrips()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return { places: data ?? [], isLoading };
}
```

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest --watchAll=false`
Expected: no tsc output; all tests pass

- [ ] **Step 7: Commit**

```bash
git add utils/trendingPlaces.ts __tests__/utils/trendingPlaces.test.ts hooks/useTrendingPlaces.ts
git commit -m "feat: trending places data for the globe

Destinations from public trips, deduped by placeId (falling back to rounded
coordinates, since AI trips can lack one until they are grounded), weighted
by saves plus likes, and ranked.

One cached query rather than a viewport search, so panning and zooming the
globe costs nothing. A missing composite index degrades to an empty layer
instead of breaking the screen, which keeps the index a deployment step
rather than a blocker."
```

---

### Task 7: Extract the map into its own component

`app/(tabs)/search.tsx` is 678 lines before this project adds layers, camera tracking and a gesture. Splitting now — while the map is still simple — is much easier than splitting later, and keeps both files small enough to reason about.

Pure refactor. **No behaviour changes.** A reviewer should be able to confirm that by reading the diff.

**Files:**
- Create: `components/search/GlobeMapView.tsx`
- Modify: `app/(tabs)/search.tsx`

**Interfaces:**
- Consumes: `useFlyTo`'s `cameraRef` (owned by the parent and passed down).
- Produces:

```ts
interface GlobeMapViewProps {
  // RefObject<T | null> matches what useRef<CameraHandle>(null) actually
  // produces, and mirrors the mapRef prop below. The looser union does not
  // typecheck against React's ref typing.
  cameraRef: React.RefObject<CameraHandle | null>;
  mapRef: React.RefObject<InstanceType<typeof MapView> | null>;
  lightPreset: LightPreset;
  onPress: (feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>) => void;
  onCameraChanged?: (zoom: number) => void;
  trendingPlaces?: TrendingPlace[];
  selectedPlace?: EnrichedPlace | null;
}
```

`onCameraChanged`, `trendingPlaces` and `selectedPlace` are declared now but unused until Tasks 8 and 9, so those tasks touch only this file.

- [ ] **Step 1: Create the component**

Move the entire `<MapView>…</MapView>` block out of `search.tsx` verbatim, including `StyleImport`, `Camera`, `onMapLoadingError`, the logo/attribution props, and the `STANDARD_STYLE` / `INITIAL_ZOOM` / `INITIAL_COORDS` constants and the `ScreenPointPayload` type. Export the constants so `search.tsx` can keep importing them:

```ts
export const INITIAL_ZOOM = 1.5;
export const INITIAL_COORDS: [number, number] = [0, 20];
export type ScreenPointPayload = { screenPointX: number; screenPointY: number };
```

Keep `setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '')` at module scope in the **new** file — it must run before any `MapView` renders, and the MapView now lives here.

- [ ] **Step 2: Render it from `search.tsx`**

```tsx
      <GlobeMapView
        cameraRef={cameraRef}
        mapRef={mapRef}
        lightPreset={lightPreset}
        onPress={handleMapPress}
      />
```

- [ ] **Step 3: Verify nothing else moved**

Run: `git diff --stat`
Expected: `search.tsx` shrinks by roughly the size of the block moved; `GlobeMapView.tsx` is new. If `search.tsx` gained any lines other than the import and the six-line render, something was rewritten rather than moved — revert and redo.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest --watchAll=false`
Expected: no tsc output; all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/search/GlobeMapView.tsx "app/(tabs)/search.tsx"
git commit -m "refactor: extract GlobeMapView from the search screen

Pure move, no behaviour change. search.tsx was 678 lines before this
project adds layers, camera tracking and a sheet gesture; splitting the map
out now keeps both files small enough to reason about, and every later task
in this project touches one file rather than both."
```

---

### Task 8: Trending pins and the selected-place pin

The globe currently renders no markers at all — fly somewhere and nothing appears. This adds both layers.

**Files:**
- Modify: `components/search/GlobeMapView.tsx`
- Modify: `app/(tabs)/search.tsx` (pass the two new props)

**Interfaces:**
- Consumes: `TrendingPlace` and `useTrendingPlaces` (Task 6), `GlobeMapViewProps` (Task 7).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add imports and the zoom cutoff**

In `GlobeMapView.tsx`:

```ts
import { useMemo } from 'react';
import { ShapeSource, CircleLayer, SymbolLayer } from '@rnmapbox/maps';
import type * as GeoJSON from 'geojson';
import { DarkColors } from '@/constants/colors';
import type { TrendingPlace } from '@/utils/trendingPlaces';
import type { EnrichedPlace } from '@/stores/usePlacesStore';

/**
 * Trending pins stop drawing here; Standard's own POI labels arrive around
 * z14 on their own. A hard cutoff rather than an interpolated opacity
 * crossfade: one prop, enforced by the native SDK, so it behaves identically
 * on iOS and Android with no per-platform tuning.
 */
const TRENDING_MAX_ZOOM = 12;
```

- [ ] **Step 2: Build the GeoJSON**

```ts
  const trendingCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (trendingPlaces ?? []).map((p) => ({
        type: 'Feature' as const,
        id: p.key,
        properties: { name: p.name, weight: p.weight, tripCount: p.tripCount },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
    }),
    [trendingPlaces],
  );

  const selectedCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: selectedPlace
        ? [
            {
              type: 'Feature' as const,
              id: selectedPlace.placeId,
              properties: { name: selectedPlace.name },
              geometry: {
                type: 'Point' as const,
                coordinates: [selectedPlace.lng, selectedPlace.lat],
              },
            },
          ]
        : [],
    }),
    [selectedPlace],
  );
```

- [ ] **Step 3: Render the layers inside `<MapView>`, after `<Camera>`**

```tsx
        {trendingCollection.features.length > 0 && (
          <ShapeSource id="trending-places" shape={trendingCollection}>
            {/* Halo first, so it sits beneath the pin. A static ring rather
                than an animated pulse: Mapbox layer props cannot be driven by
                Animated without per-frame setState, which is a real cost for
                a decorative effect. */}
            <CircleLayer
              id="trending-halo"
              maxZoomLevel={TRENDING_MAX_ZOOM}
              style={{
                circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 11, 100, 19],
                circleColor: DarkColors.brand.purple,
                circleOpacity: 0.18,
              }}
            />
            <CircleLayer
              id="trending-circle"
              maxZoomLevel={TRENDING_MAX_ZOOM}
              style={{
                circleRadius: ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 100, 11],
                circleColor: DarkColors.brand.purple,
                circleStrokeWidth: 1.5,
                circleStrokeColor: '#ffffff',
              }}
            />
            <SymbolLayer
              id="trending-label"
              maxZoomLevel={TRENDING_MAX_ZOOM}
              style={{
                textField: ['get', 'name'],
                textSize: 11,
                textColor: '#ffffff',
                textHaloColor: 'rgba(0,0,0,0.6)',
                textHaloWidth: 1,
                textOffset: [0, 1.4],
                textAnchor: 'top',
              }}
            />
          </ShapeSource>
        )}

        {selectedCollection.features.length > 0 && (
          <ShapeSource id="selected-place" shape={selectedCollection}>
            {/* No maxZoomLevel — the selection stays visible at every zoom.
                This is also the only confirmation that a tap registered. */}
            <CircleLayer
              id="selected-circle"
              style={{
                circleRadius: 13,
                circleColor: DarkColors.brand.purple,
                circleStrokeWidth: 3,
                circleStrokeColor: '#ffffff',
              }}
            />
          </ShapeSource>
        )}
```

- [ ] **Step 4: Wire the props from `search.tsx`**

```tsx
  const { places: trendingPlaces } = useTrendingPlaces();
```

```tsx
      <GlobeMapView
        cameraRef={cameraRef}
        mapRef={mapRef}
        lightPreset={lightPreset}
        onPress={handleMapPress}
        trendingPlaces={trendingPlaces}
        selectedPlace={selectedPlace}
      />
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest --watchAll=false`
Expected: no tsc output; all tests pass

- [ ] **Step 6: Verify on device**

Launch the app, open Search. Expect purple pins with haloes and name labels over the globe; zooming past z12 makes them disappear and Standard's POI labels take over around z14. Tapping a search result now leaves a visible pin.

- [ ] **Step 7: Commit**

```bash
git add components/search/GlobeMapView.tsx "app/(tabs)/search.tsx"
git commit -m "feat: trending pins and a selected-place marker on the globe

The globe rendered no markers at all — flying to a place left the map
showing nothing, not even confirmation that a tap had registered.

Trending destinations now draw as purple pins with a static halo, sized by
weight so the biggest destinations read first, cut off at maxZoomLevel 12
where Standard's own POI labels take over. The halo is static rather than
animated because Mapbox layer properties cannot be driven by Animated
without per-frame setState.

The selected place draws at every zoom, with no cutoff."
```

---

### Task 9: Back to the globe

Today the only route back to world view is clearing the search field — not discoverable, and not recognisable as a camera control.

**Files:**
- Modify: `components/search/GlobeMapView.tsx` (emit zoom)
- Modify: `app/(tabs)/search.tsx` (the button)

- [ ] **Step 1: Emit zoom from the map**

In `GlobeMapView.tsx`, add to `<MapView>`:

```tsx
        onCameraChanged={(state) => onCameraChanged?.(state.properties.zoom)}
```

- [ ] **Step 2: Track it without re-rendering on every frame**

In `search.tsx`. **`onCameraChanged` fires continuously through a pinch** — putting the raw zoom in state would re-render the whole screen every frame of every gesture. Keep the value in the ref added in Task 5, and lift only the boolean:

```ts
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  const handleCameraChanged = useCallback((zoom: number) => {
    zoomRef.current = zoom;
    // Only a threshold crossing reaches React — at most twice per gesture,
    // rather than once per frame.
    const next = zoom > 6;
    setIsZoomedIn((prev) => (prev === next ? prev : next));
  }, []);
```

Pass `onCameraChanged={handleCameraChanged}` to `GlobeMapView`.

- [ ] **Step 3: Add the reset handler**

```ts
  const handleBackToGlobe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlace(null);
    setNearbyResults(null);
    hideSheet();
    flyTo(INITIAL_COORDS[0], INITIAL_COORDS[1], INITIAL_ZOOM);
  }, [setSelectedPlace, hideSheet, flyTo]);
```

`flyTo` resets pitch and heading via `pitchForZoom` / `headingForArrival` at `INITIAL_ZOOM` (which is below 8, so pitch 0). No extra reset needed.

- [ ] **Step 4: Render the button**

After the enriching badge, before the results sheet:

```tsx
      {isZoomedIn && (
        <TouchableOpacity
          onPress={handleBackToGlobe}
          style={[
            styles.globeButton,
            {
              // 128, not 96. The Mapbox logo and attribution sit at a FIXED
              // bottom: 88 and are not inset-aware, so on a device with a
              // small or zero bottom inset a 96 offset puts this button on
              // top of them. Attribution is required by Mapbox's terms, so
              // this must clear it on every device, not just notched ones.
              bottom: insets.bottom + 128,
              backgroundColor: `${colors.background.primary}D9`,
              borderColor: colors.background.cardBorder,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to globe"
        >
          <Globe size={20} color={colors.text.primary} weight="duotone" />
        </TouchableOpacity>
      )}
```

Import `Globe` from `phosphor-react-native`. Add to `StyleSheet.create`:

```ts
  globeButton: {
    position: 'absolute',
    right: Spacing['5'],
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

- [ ] **Step 5: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx jest --watchAll=false
git add components/search/GlobeMapView.tsx "app/(tabs)/search.tsx"
git commit -m "feat: back-to-globe control

Returning to world view previously required clearing the search field —
undiscoverable, and not recognisable as a camera control. A globe button
now appears once zoomed past z6.

Zoom is tracked in a ref with only the threshold crossing lifted into
state: onCameraChanged fires continuously through a pinch, so storing the
raw value would re-render the screen every frame of every gesture."
```

---

### Task 10: Chrome tokens and the editorial signature

**Files:**
- Modify: `app/(tabs)/search.tsx`

- [ ] **Step 1: Replace the hand-rolled borders**

`DarkColors.background.cardBorder` (`#26232E`) is the app's hairline token and is warmer than the cool white currently used. In `StyleSheet.create`, replace **both** occurrences of `borderColor: 'rgba(255,255,255,0.15)'` with `borderColor: DarkColors.background.cardBorder`.

In the active-tab inline style, replace the inactive branch `'rgba(255,255,255,0.15)'` with `colors.background.cardBorder`.

- [ ] **Step 2: Reduce the active tab to a single purple treatment**

The active tab currently carries purple fill, purple border and purple text — three independently coloured surfaces for one state, where the design system treats the accent as "a jewel against neutrals". Take the fill out of the state entirely, leaving a purple outline and purple label on a neutral chip. Outline-plus-label in one hue reads as a single treatment, not two competing signals:

```tsx
                  {
                    backgroundColor: `${colors.background.primary}B3`,
                    borderColor:
                      activeTab === tab ? colors.brand.purple : colors.background.cardBorder,
                  },
```

The fill no longer varies by state; the border and text carry it.

- [ ] **Step 3: Add the eyebrow**

Above the map chrome, visible only when idle — no query, no selection, no nearby results:

```tsx
      {!showingQuery && !selectedPlace && nearbyResults === null && (
        <View style={[styles.eyebrowWrap, { paddingTop: insets.top + 68 }]} pointerEvents="none">
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>
            {trendingPlaces.length > 0
              ? `TRENDING NOW · ${trendingPlaces.length} PLACES`
              : 'TRENDING NOW'}
          </Text>
        </View>
      )}
```

The bare `TRENDING NOW` while loading avoids flashing `0 PLACES`. `pointerEvents="none"` keeps it from stealing map taps.

```ts
  eyebrowWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.9,
  },
```

- [ ] **Step 4: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx jest --watchAll=false
git add "app/(tabs)/search.tsx"
git commit -m "style: Supernova chrome on the globe screen

Hand-rolled rgba(255,255,255,0.15) borders become the warmer cardBorder
token that already exists, and the active tab drops from three purple
signals to one — the design system treats the accent as a jewel against
neutrals, and spending it on chrome fill dilutes it.

Adds the eyebrow the light screens all have and this one lacked, labelling
the curated layer with a live pin count."
```

---

### Task 11: The light-to-dark transition

The design skill names this: *"The light→dark transition is a signature moment — fade/scale it, never hard-cut."* Tabbing from a light screen into the globe is currently an instant swap. `Duration.slow` is already documented in `constants/motion.ts` as being for "dark-immersion transitions" and has never been used here.

**Files:**
- Modify: `app/(tabs)/search.tsx`

- [ ] **Step 1: Add the animated values**

```ts
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const revealScale = useRef(new Animated.Value(1.04)).current;
```

- [ ] **Step 2: Run the reveal on focus**

Extend the existing `useFocusEffect` that already refreshes `lightPreset`:

```ts
  useFocusEffect(
    useCallback(() => {
      setLightPreset(lightPresetForNow());

      revealOpacity.setValue(1);
      revealScale.setValue(1.04);
      Animated.parallel([
        fadeTo(revealOpacity, 0, Duration.slow),
        Animated.spring(revealScale, { toValue: 1, ...SPRING }),
      ]).start();
      // No reverse on blur: tab swaps away are immediate, and an exit
      // animation would delay the next screen appearing.
    }, [revealOpacity, revealScale]),
  );
```

Import `Duration` and `fadeTo` from `@/constants/motion`.

- [ ] **Step 3: Scale the map and pin the overlay**

Wrap `GlobeMapView` in an `Animated.View` carrying the scale, and add the overlay as the **last** child of the root `View` so it covers everything:

```tsx
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: revealScale }] }]}>
        <GlobeMapView … />
      </Animated.View>
```

```tsx
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background.primary, opacity: revealOpacity },
        ]}
      />
```

`pointerEvents="none"` is essential — without it the overlay swallows the first tap after every focus.

- [ ] **Step 4: Verify on device**

Tab between Profile (light) and Search several times. The globe should resolve out of darkness rather than snapping in. **If the overlay fights the tab bar's own transition, stop and report it** rather than layering workarounds.

- [ ] **Step 5: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx jest --watchAll=false
git add "app/(tabs)/search.tsx"
git commit -m "feat: fade into the globe instead of hard-cutting

Entering the Search tab swapped instantly from light chrome to the dark
globe. The design system calls the light-to-dark transition a signature
moment that should never be a hard cut, and constants/motion.ts already
documented Duration.slow as being for dark-immersion transitions without
anything using it here.

A dark overlay now fades out over 400ms while the map settles from 1.04 to
1.0, matching the reveal the auth screens already use."
```

---

### Task 12: Draggable results sheet

Last, and the riskiest — gesture composition over a nested `ScrollView` is the classic source of a sheet that can be dragged but not scrolled, or the reverse. Everything before this stands on its own if this task is dropped.

**Files:**
- Modify: `app/(tabs)/search.tsx`

- [ ] **Step 1: Add snap points**

Module scope, beside the existing `SCREEN_HEIGHT`:

```ts
// Two positions: expanded (current behaviour) and peek, which leaves the map
// visible behind roughly two result rows.
const SHEET_PEEK_Y = SCREEN_HEIGHT * 0.35;
const SHEET_EXPANDED_Y = 0;
```

Inside the component — the drag needs to know where the sheet started, since
`slideAnim` is being written directly during the gesture and cannot be read
back synchronously:

```ts
  // Initialised to SCREEN_HEIGHT, matching slideAnim's own initial value
  // (`useRef(new Animated.Value(SCREEN_HEIGHT))` — the sheet starts hidden).
  // Seeding this to 0 instead would make the first drag jump a full screen.
  const sheetBaseY = useRef(SCREEN_HEIGHT);
```

`showSheet` and `hideSheet` must keep it in sync, or the next drag starts from
a stale origin and the sheet jumps:

```ts
  const showSheet = useCallback(() => {
    sheetBaseY.current = SHEET_EXPANDED_Y;
    Animated.spring(slideAnim, { toValue: SHEET_EXPANDED_Y, ...SPRING }).start();
  }, [slideAnim]);

  const hideSheet = useCallback(() => {
    sheetBaseY.current = SCREEN_HEIGHT;
    Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT, ...SPRING }).start();
  }, [slideAnim]);
```

- [ ] **Step 2: Add the gesture**

`react-native-gesture-handler` is already a dependency and `GestureHandlerRootView` already wraps the app in `app/_layout.tsx`, so no setup is needed. Add the import:

```ts
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
```

```tsx
  const scrollRef = useRef(null);

  const panGesture = Gesture.Pan()
    .simultaneousWithExternalGesture(scrollRef)
    .onUpdate((e) => {
      const next = sheetBaseY.current + e.translationY;
      slideAnim.setValue(Math.max(SHEET_EXPANDED_Y, Math.min(SCREEN_HEIGHT, next)));
    })
    .onEnd((e) => {
      // Velocity decides, so a flick works as well as a long drag.
      const target =
        e.velocityY > 500
          ? SHEET_PEEK_Y
          : e.velocityY < -500
            ? SHEET_EXPANDED_Y
            : sheetBaseY.current + e.translationY > SHEET_PEEK_Y / 2
              ? SHEET_PEEK_Y
              : SHEET_EXPANDED_Y;
      sheetBaseY.current = target;
      Animated.spring(slideAnim, { toValue: target, ...SPRING }).start();
    });
```

`simultaneousWithExternalGesture` is what lets the sheet drag and the list scroll coexist. **Wire it from the start rather than tuning to iOS behaviour alone** — Android resolves this composition differently, and the Android pass should be a test, not a redesign.

**`scrollRef` must actually be attached**, or the composition is a no-op and the
drag and the scroll will fight — the exact failure this task is most at risk of.
Both platform branches render their own `ScrollView`, so both need it:

```tsx
              <ScrollView
                ref={scrollRef}
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
```

Add it to the iOS (`BlurView`) branch and the Android (`View`) branch alike.

- [ ] **Step 3: Apply to both platform branches**

The sheet body is `BlurView` on iOS and a solid `View` on Android. Wrap the shared `Animated.View` — not the inner branches — in `<GestureDetector>`, so one gesture serves both.

- [ ] **Step 4: Keep `PlaceDetailSheet` consistent**

`slideAnim` is passed to **both** the results sheet and `PlaceDetailSheet` (`search.tsx` hands the same `Animated.Value` to each). Dragging the results sheet therefore moves the detail sheet too.

Confirm on device that both read correctly. If they conflict, give `PlaceDetailSheet` its own `Animated.Value` rather than trying to reconcile one value across two sheets with different heights.

- [ ] **Step 5: Verify on device**

Search for a city. Drag the sheet down — it should settle at peek with the map visible behind. Scroll the results list — it should scroll without dragging the sheet. Drag from the handle — the sheet should move.

**If the gesture and the scroll cannot be made to coexist, fall back to making only the sheet handle draggable.** A smaller reliable interaction beats a sheet that fights the user.

- [ ] **Step 6: Typecheck, test, commit**

```bash
npx tsc --noEmit && npx jest --watchAll=false
git add "app/(tabs)/search.tsx"
git commit -m "feat: draggable results sheet

The results sheet was dismiss-or-nothing, so searching and looking at the
map were mutually exclusive. It now snaps between expanded and a peek
position that leaves the map visible, with velocity deciding on release.

simultaneousWithExternalGesture is wired from the start rather than tuned
to iOS alone, since Android resolves pan-over-scroll composition
differently."
```

---

## Verification

After every task: `npx tsc --noEmit && npx jest --watchAll=false`

After the final task, on an iOS device or simulator:

- [ ] Globe opens with purple trending pins and the `TRENDING NOW · n PLACES` eyebrow
- [ ] Entering the tab fades in rather than hard-cutting
- [ ] Tapping a trending pin flies in at an angle, with 3D buildings visible
- [ ] Trending pins disappear past z12; Standard POI labels appear around z14
- [ ] Tapping a POI label opens the detail sheet with a pin on the map
- [ ] Tapping empty ground at street zoom returns "Places near here"
- [ ] Tapping empty ocean at globe zoom flies in rather than calling the API
- [ ] Every tap produces a haptic AND a visible ring pulse immediately, before any result
- [ ] The pulse still reads with the phone's silent switch on (haptics suppressed)
- [ ] The globe button appears when zoomed in and returns to world view flat
- [ ] The results sheet drags to peek and its list still scrolls
- [ ] Searching a country fits its bounds flat, not tilted — even directly after visiting a POI

## Deferred

- Android: register the `@rnmapbox/maps` Expo config plugin with the download token, get a green build, then re-run this checklist on physical hardware.
- Composite Firestore index `trips(visibility ASC, savesCount DESC)`. Until it exists the globe simply shows no trending pins.
