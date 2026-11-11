# Search globe at any distance: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The Search globe stays clean at every zoom and tilt: crowded destinations group into count bubbles that split as you zoom, pins and labels are sized by zoom and ranked by popularity, the heat map is a soft glow, and friends stack at world view.
- About 30 new catalog destinations fill Africa, the Middle East, East Asia and China, and South Asia.

**Architecture:**
- **Pure rules** live in `utils/heatmap.ts` (the tap target and pin features with popularity) and `utils/friendsTraveling.ts` (friend stacks).
- **Layers.** `components/search/GlobeMapView.tsx` turns on Mapbox clustering on the destination source, adds the bubble layers, sizes pins and halos by zoom, ranks labels with `symbolSortKey`, retunes the heat map, and renders friend stacks.
- **Bubble taps.** `app/(tabs)/search.tsx` asks the source for the cluster's expansion zoom and flies there.
- **Catalog.** `data/destinations.json` gets 30 entries, checked by the existing catalog test plus a city-size check on explicit boxes.

**Tech Stack:** Expo / React Native, @rnmapbox/maps (`ShapeSource` clustering, `CircleLayer`, `SymbolLayer`, `HeatmapLayer`, `MarkerView`), Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-11-11-globe-any-distance-design.md`

## Global Constraints

**Clustering**
- `cluster`, `clusterRadius={50}`, `clusterMaxZoomLevel={5}`.
- Bubble radius 16 px for 2 points, up to 28 px at 25 or more.
- Fill brand purple at 0.85 opacity, white 1.5 px ring; count white, semibold, 12 pt.

**Pins**
- Pin radius by zoom: 4 px at zoom 2 to 8 px at zoom 8, plus a weight bonus of up to 3 px.
- Halo radius 9 px at zoom 2 to 16 px at zoom 8.

**Labels**
- `symbolSortKey: -popularity` (more popular labels win collisions).
- `textPitchAlignment: 'viewport'`, `textRotationAlignment: 'viewport'`.

**Heat map**
- Radius 4 px at zoom 0, 10 px at zoom 3, 22 px at zoom 6.
- Intensity 0.35 at zoom 0, 1.2 at zoom 6.
- The ramp reaches pale amber only at density 0.95.
- Opacity fades 0.85 → 0 between zoom 7 and 10 (as now).

**Taps**
- A bubble flies to `getClusterExpansionZoom + 0.2` over 900 ms (`flyTo`).
- A city pin opens `/destination/[slug]`.
- Friend avatars are native `MarkerView`s with their own tap, drawn above the map layers, so they already take taps before the map.

**Friends**
- Below zoom 4, friends within about 60 px merge into stacks of up to 3 faces plus `+N`; tapping a stack flies in.
- From zoom 4, `spreadCluster` (unchanged).
- Privacy rules unchanged.

**Catalog**
- 30 new entries:
  - Africa: Serengeti, Nairobi, Victoria Falls, Okavango, Kruger, Essaouira, Mauritius, Seychelles.
  - Middle East: Petra, Wadi Rum, Abu Dhabi, Doha, Muscat, Jerusalem, Amman.
  - East Asia / China: Tokyo, Osaka, Beijing, Shanghai, Taipei, Busan, Hokkaido, Guilin.
  - South Asia: Jaipur, Goa, Kathmandu, Sri Lanka, Maldives, Kerala.
- Nature areas carry `center` + `bbox`, at most 1.6° wide.
- Seeding happens only with the owner's OK, after a dry run. The covers are key-less.

**General**
- No new running cost.
- UI rules: `useTheme` colors inline, except in always-dark globe files (allowed to use `DarkColors`); `accessibilityLabel` on tappables; 44 pt targets; `useCallback` handlers passed as props.
- Tests are pure only: `npx jest <path>`; the whole suite is `npx jest`; typecheck with `npx tsc --noEmit -p .`.
- **Ruling (pre-recorded):** the spec's `globeTapTarget` listed `friend` as a target. Friend avatars are native `MarkerView`s whose taps never reach the map's `onPress`, so the helper only chooses between cluster and destination. Friends already win by being native views on top. Cost if wrong: none.

## Review Focus

1. **Tapping a bubble when the source can't answer** (the ref isn't mounted, or `getClusterExpansionZoom` throws): fly in by +2 zoom at the bubble rather than doing nothing. Pinned in Task 1 (`clusterFlyZoom`).
2. **Friend stacks for 1 friend, several friends at the exact same spot, and friends far apart:**
   - 1 friend → a single marker;
   - the same spot → one stack;
   - far apart → separate.

   Pinned in Task 2.
3. **A bad catalog entry** (duplicate slug, a region chip not in the set, a box wider than 1.6°) must fail the catalog test, never reach the seed. Pinned in Task 4.
4. **A tap on a bubble's count text or on its edge:** it must resolve to the bubble, not fall through to a billed POI lookup. Pinned in Task 1: `globeTapTarget` reads `cluster_id` from any feature, and the tap layer list includes the bubble layers.
5. **Popularity missing on a feature** (an older catalog doc): labels must still render, so the sort key defaults to 0. Pinned in Task 1 (`destinationPinFeatures` defaults `popularity` to 0).

---

### Task 1: Tap target and pin features (pure)

**Files:**
- Modify: `utils/heatmap.ts`
- Test: `__tests__/utils/heatmap.test.ts` (append)

**Interfaces:**
- Produces:
  - `DESTINATION_PIN_LAYERS` adds `'destination-cluster'` and `'destination-cluster-count'`.
  - `destinationPinFeatures(list)` properties gain `popularity: number` (0 when missing).
  - `type GlobeTap = { kind: 'cluster'; clusterId: number; coordinates: [number, number]; count: number } | { kind: 'destination'; slug: string }`
  - `globeTapTarget(fc: GeoJSON.FeatureCollection | null | undefined): GlobeTap | null`, where a cluster wins over a destination.
  - `clusterFlyZoom(expansionZoom: number | null, currentZoom: number): number`, which gives `expansionZoom + 0.2` when known, else `currentZoom + 2`, capped at 12.

- [ ] **Step 1: Write the failing tests.** Append to `__tests__/utils/heatmap.test.ts`:

```ts
import { clusterFlyZoom, destinationPinFeatures, DESTINATION_PIN_LAYERS, globeTapTarget } from '@/utils/heatmap';

describe('globe taps at any distance (spec 2026-11-11)', () => {
  const pin = { type: 'Feature', properties: { slug: 'lisbon', name: 'Lisbon' }, geometry: { type: 'Point', coordinates: [-9.1, 38.7] } };
  const bubble = { type: 'Feature', properties: { cluster: true, cluster_id: 42, point_count: 24 }, geometry: { type: 'Point', coordinates: [10, 50] } };
  it('a bubble wins over a pin under the same tap (review focus 4)', () => {
    expect(globeTapTarget({ type: 'FeatureCollection', features: [pin, bubble] } as never)).toEqual({ kind: 'cluster', clusterId: 42, coordinates: [10, 50], count: 24 });
  });
  it('a lone pin opens its destination', () => {
    expect(globeTapTarget({ type: 'FeatureCollection', features: [pin] } as never)).toEqual({ kind: 'destination', slug: 'lisbon' });
  });
  it('nothing for an empty tap', () => {
    expect(globeTapTarget(null)).toBeNull();
    expect(globeTapTarget({ type: 'FeatureCollection', features: [] })).toBeNull();
  });
  it('the tap layers include the bubble layers', () => {
    expect(DESTINATION_PIN_LAYERS).toEqual(expect.arrayContaining(['destination-cluster', 'destination-cluster-count', 'destination-pin']));
  });
  it('clusterFlyZoom: expansion + 0.2, else +2, never past 12 (review focus 1)', () => {
    expect(clusterFlyZoom(4, 1.5)).toBeCloseTo(4.2);
    expect(clusterFlyZoom(null, 1.5)).toBe(3.5);
    expect(clusterFlyZoom(13, 11)).toBe(12);
  });
  it('pin features carry popularity, 0 when missing (review focus 5)', () => {
    const fc = destinationPinFeatures([{ slug: 'a', name: 'A', popularity: 80, center: { lat: 1, lng: 2 } }, { slug: 'b', name: 'B', center: { lat: 3, lng: 4 } }] as never);
    expect(fc.features.map((f) => f.properties.popularity)).toEqual([80, 0]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/heatmap.test.ts`
  - Expected: FAIL (`globeTapTarget` / `clusterFlyZoom` are not exported, and `popularity` is undefined).

- [ ] **Step 3: Implement.** In `utils/heatmap.ts`:
  - In `destinationPinFeatures`, change the properties to `{ slug: d.slug, name: d.name, weight: d.popularity ?? 0, popularity: d.popularity ?? 0 }`, and the return type's properties to `{ slug: string; name: string; weight: number; popularity: number }`.
  - Change `DESTINATION_PIN_LAYERS` to `['destination-cluster', 'destination-cluster-count', 'destination-halo', 'destination-pin', 'destination-label']`.
  - Add:

```ts
export type GlobeTap = { kind: 'cluster'; clusterId: number; coordinates: [number, number]; count: number } | { kind: 'destination'; slug: string };

/** What a globe tap hit (spec 2026-11-11): a bubble wins over a pin under it; friends are native markers and never reach here. */
export function globeTapTarget(fc: GeoJSON.FeatureCollection | null | undefined): GlobeTap | null {
  const features = fc?.features ?? [];
  for (const f of features) {
    const p = (f.properties ?? {}) as { cluster_id?: unknown; point_count?: unknown };
    if (typeof p.cluster_id === 'number' && f.geometry?.type === 'Point') {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      return { kind: 'cluster', clusterId: p.cluster_id, coordinates: [lng, lat], count: typeof p.point_count === 'number' ? p.point_count : 0 };
    }
  }
  const slug = destinationSlugFromFeatures(fc ?? null);
  return slug ? { kind: 'destination', slug } : null;
}

/** Where a bubble tap flies: just past the zoom where it splits, else two levels closer; never past street level. */
export function clusterFlyZoom(expansionZoom: number | null, currentZoom: number): number {
  return Math.min(12, expansionZoom != null ? expansionZoom + 0.2 : currentZoom + 2);
}
```

  If `Destination.popularity` is typed as required in `utils/destinations.ts`, keep `?? 0` anyway (older docs may lack it) and add a `// eslint-disable-next-line` only if lint complains about an unnecessary condition.

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/utils/heatmap.test.ts`
  - Expected: PASS, existing tests included. If an existing test pinned the old `DESTINATION_PIN_LAYERS` value, update it to the new list (an intended change) and record a ruling.

- [ ] **Step 5: Commit.**

```bash
git add utils/heatmap.ts __tests__/utils/heatmap.test.ts
git commit -m "feat(globe): tap target for bubbles and pins, pin popularity"
```

---

### Task 2: Friend stacks (pure)

**Files:**
- Modify: `utils/friendsTraveling.ts`
- Test: `__tests__/utils/friendsTraveling.test.ts` (append)

**Interfaces:**
- Produces:
  - `type FriendStack<T> = { key: string; lat: number; lng: number; faces: T[]; extra: number }`
  - `friendStacks<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): { stacks: FriendStack<T>[]; singles: T[] }`
  - Below zoom 4: greedy grouping, each entry joining the first stack whose centre is within 60 px. Groups of 2 or more become stacks (`faces` = first 3 by uid, `extra` = the rest); groups of one become `singles`.
  - From zoom 4: `{ stacks: [], singles: spreadCluster(entries, zoom) }`.
  - `STACK_MAX_ZOOM = 4`.

- [ ] **Step 1: Write the failing tests.** Append to `__tests__/utils/friendsTraveling.test.ts`:

```ts
import { friendStacks } from '@/utils/friendsTraveling';

describe('friendStacks (spec 2026-11-11; review focus 2)', () => {
  const f = (uid: string, lat: number, lng: number) => ({ uid, lat, lng });
  it('one friend stays a single marker', () => {
    expect(friendStacks([f('a', 48.85, 2.35)], 1)).toEqual({ stacks: [], singles: [f('a', 48.85, 2.35)] });
  });
  it('friends close together at world view become one stack of ≤ 3 faces + extra', () => {
    const r = friendStacks([f('d', 48.85, 2.35), f('a', 50.85, 4.35), f('c', 52.37, 4.9), f('b', 51.5, -0.12)], 1);
    expect(r.singles).toEqual([]);
    expect(r.stacks).toHaveLength(1);
    expect(r.stacks[0].faces.map((x) => x.uid)).toEqual(['a', 'b', 'c']);
    expect(r.stacks[0].extra).toBe(1);
  });
  it('friends far apart stay separate', () => {
    const r = friendStacks([f('a', 48.85, 2.35), f('b', 35.68, 139.69)], 1);
    expect(r.stacks).toEqual([]);
    expect(r.singles).toHaveLength(2);
  });
  it('from zoom 4 it defers to spreadCluster (no stacks)', () => {
    const r = friendStacks([f('a', 48.85, 2.35), f('b', 48.85, 2.35)], 5);
    expect(r.stacks).toEqual([]);
    expect(r.singles).toHaveLength(2);
    expect(r.singles[0].lat).not.toBe(r.singles[1].lat);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/friendsTraveling.test.ts`
  - Expected: FAIL (`friendStacks` is not exported).

- [ ] **Step 3: Implement.** Append to `utils/friendsTraveling.ts`:

```ts
export const STACK_MAX_ZOOM = 4;
const STACK_PX = 60;
export type FriendStack<T> = { key: string; lat: number; lng: number; faces: T[]; extra: number };

/**
 * Friends at world view (spec 2026-11-11): friends within ~60 px merge into one stack (≤ 3 faces + "+N"), so avatars
 * never pile up over Europe; from zoom 4 each friend shows, spread around shared cities (spreadCluster).
 */
export function friendStacks<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): { stacks: FriendStack<T>[]; singles: T[] } {
  if (zoom >= STACK_MAX_ZOOM) return { stacks: [], singles: spreadCluster(entries, zoom) };
  const degPerPx = 360 / (512 * 2 ** zoom);
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.hypot((a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), a.lat - b.lat) / degPerPx <= STACK_PX;
  const groups: { lat: number; lng: number; members: T[] }[] = [];
  for (const e of [...entries].sort((x, y) => x.uid.localeCompare(y.uid))) {
    const g = groups.find((x) => near(x, e));
    if (g) {
      g.members.push(e);
      g.lat = g.members.reduce((s, m) => s + m.lat, 0) / g.members.length;
      g.lng = g.members.reduce((s, m) => s + m.lng, 0) / g.members.length;
    } else groups.push({ lat: e.lat, lng: e.lng, members: [e] });
  }
  const stacks: FriendStack<T>[] = [];
  const singles: T[] = [];
  for (const g of groups) {
    if (g.members.length === 1) { singles.push(g.members[0]); continue; }
    stacks.push({ key: g.members.map((m) => m.uid).join('|'), lat: g.lat, lng: g.lng, faces: g.members.slice(0, 3), extra: Math.max(0, g.members.length - 3) });
  }
  return { stacks, singles };
}
```

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/utils/friendsTraveling.test.ts`
  - Expected: PASS. If "friends close together" leaves Amsterdam or London as a single, check the arithmetic at zoom 1: 60 px is about 42° there, so Paris, Brussels, Amsterdam and London all fall within it. Fix the code, not the test.

- [ ] **Step 5: Commit.**

```bash
git add utils/friendsTraveling.ts __tests__/utils/friendsTraveling.test.ts
git commit -m "feat(globe): friend stacks at world view"
```

---

### Task 3: Globe layers, bubble taps and friend stacks

**Files:**
- Modify: `components/search/GlobeMapView.tsx`
- Modify: `components/search/FriendTravelMarker.tsx` (stack mode)
- Modify: `app/(tabs)/search.tsx` (tap flow)

**Interfaces:**
- Consumes: `globeTapTarget`, `clusterFlyZoom`, `DESTINATION_PIN_LAYERS` (Task 1); `friendStacks`, `FriendStack` (Task 2).
- Produces:
  - `GlobeMapView` prop `destinationSourceRef: React.RefObject<ShapeSource | null>`.
  - `GlobeMapView` prop `onFriendStackPress?: (stack: FriendStack<FriendTraveling>) => void`.
  - `FriendTravelMarker` gains an optional `stack?: { faces: FriendTraveling[]; extra: number }` (when set, it renders overlapping avatars).

- [ ] **Step 1: Cluster the destination source.** In `GlobeMapView.tsx`:
  - Add the prop `destinationSourceRef`.
  - Change `<ShapeSource id="destination-places" shape={destinationCollection}>` to:

```tsx
        <ShapeSource
          id="destination-places"
          ref={destinationSourceRef}
          shape={destinationCollection}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={5}
        >
```

- [ ] **Step 2: Bubble layers.** Inside that source, before the halo, add:

```tsx
          {/* Crowded regions group into a bubble with a count; it splits as you zoom (spec 2026-11-11). */}
          <CircleLayer
            id="destination-cluster"
            filter={['has', 'point_count']}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 25, 28],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.85,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="destination-cluster-count"
            filter={['has', 'point_count']}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: 12,
              textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              textColor: '#ffffff',
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
              textRotationAlignment: 'viewport',
            }}
          />
```

- [ ] **Step 3: Pins, halos and labels by zoom, ranked.** Replace the halo, pin and label layers with:

```tsx
          <CircleLayer
            id="destination-halo"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 9, 8, 16],
              circleColor: DarkColors.brand.purple,
              circleOpacity: 0.18,
              circleEmissiveStrength: 1,
            }}
          />
          <CircleLayer
            id="destination-pin"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: ['+', ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 8], ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 100, 3]],
              circleColor: DarkColors.brand.purple,
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="destination-label"
            maxZoomLevel={TRENDING_MAX_ZOOM}
            filter={['!', ['has', 'point_count']]}
            style={{
              textField: ['get', 'name'],
              textSize: ['interpolate', ['linear'], ['zoom'], 2, 10, 8, 12],
              textColor: '#ffffff',
              textHaloColor: 'rgba(0,0,0,0.6)',
              textHaloWidth: 1,
              textOffset: [0, 1.4],
              textAnchor: 'top',
              // The more popular name wins a collision; the other appears as you zoom in.
              symbolSortKey: ['*', -1, ['coalesce', ['get', 'popularity'], 0]],
              textPitchAlignment: 'viewport',
              textRotationAlignment: 'viewport',
            }}
          />
```

  If TypeScript rejects `textFont`, delete that line; Standard's default font is fine. If a style expression type errors, cast that style object with `as never`, the same way the trip map's route styles do. Record a ruling if so.

- [ ] **Step 4: Retune the heat map.** In the `HeatmapLayer` style, set:
  - `heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 0, 0.35, 6, 1.2]`
  - `heatmapRadius: ['interpolate', ['linear'], ['zoom'], 0, 4, 3, 10, 6, 22]`
  - the colour ramp: `0, 'rgba(76,63,168,0)', 0.25, 'rgba(76,63,168,0.45)', 0.55, '#7F77DD', 0.85, '#D4537E', 0.95, '#FDE7B0'`

  Keep `heatmapOpacity` as it is.

- [ ] **Step 5: Friend stacks.**
  - In `GlobeMapView.tsx`, replace `const friendMarkers = useMemo(() => spreadCluster(friends ?? [], zoomBucket), [friends, zoomBucket]);` with:

```tsx
  // Friends at any distance (spec 2026-11-11): stacked at world view, spread around shared cities closer in.
  const friendLayout = useMemo(() => friendStacks(friends ?? [], zoomBucket), [friends, zoomBucket]);
```

  - Render `friendLayout.singles` exactly as `friendMarkers` was rendered.
  - Render each stack as a `MarkerView` at `[stack.lng, stack.lat]` holding `<FriendTravelMarker friend={stack.faces[0]} stack={{ faces: stack.faces, extra: stack.extra }} onPress={() => onFriendStackPress?.(stack)} />`. Wrap that handler with `useCallback` per stack key, using a small `FriendStackMarker` wrapper component so the hook rules hold.
  - Import `friendStacks` and `FriendStack` from `@/utils/friendsTraveling`, and remove the `spreadCluster` import if it's now unused.

  In `FriendTravelMarker.tsx`:
  - Add `stack?: { faces: FriendTraveling[]; extra: number }` to `Props`.
  - When `stack` is set, render the faces as overlapping 28 px circles (each offset `-10` px left, the brand ring border as now), a `+{extra}` pill when `extra > 0`, and no name line.
  - Set `accessibilityLabel` to ``${stack.faces.map((f) => f.name).join(', ')}${stack.extra ? ` and ${stack.extra} more` : ''} are travelling here — zoom in``.
  - Keep the 44 pt touch target, padding as needed.

- [ ] **Step 6: Bubble taps in Search.** In `app/(tabs)/search.tsx`:
  - Create `const destinationSourceRef = useRef<ShapeSource | null>(null);` (import `ShapeSource` from `@rnmapbox/maps`) and pass it to `GlobeMapView`.
  - Replace the destination-pin block in the tap handler:

```ts
      const pinSlug = destinations.length === 0 ? null : await findDestinationAt(async () =>
        mapRef.current?.queryRenderedFeaturesInRect(tapBbox(screenPointX, screenPointY), [], DESTINATION_PIN_LAYERS),
      );
      if (pinSlug) {
        router.push(`/destination/${pinSlug}`);
        return;
      }
```

  with:

```ts
      // A bubble flies in until it splits; a city pin opens its page — both before any (billed) POI lookup.
      const hit = destinations.length === 0 ? null : globeTapTarget(
        await mapRef.current?.queryRenderedFeaturesInRect(tapBbox(screenPointX, screenPointY), [], DESTINATION_PIN_LAYERS).catch(() => null),
      );
      if (hit?.kind === 'cluster') {
        const feature = { type: 'Feature', properties: { cluster: true, cluster_id: hit.clusterId, point_count: hit.count }, geometry: { type: 'Point', coordinates: hit.coordinates } } as GeoJSON.Feature;
        const expansion = await destinationSourceRef.current?.getClusterExpansionZoom(feature).catch(() => null) ?? null;
        flyTo(hit.coordinates[0], hit.coordinates[1], clusterFlyZoom(expansion, zoomRef.current));
        return;
      }
      if (hit?.kind === 'destination') {
        router.push(`/destination/${hit.slug}`);
        return;
      }
```

  Import `globeTapTarget` and `clusterFlyZoom` from `@/utils/heatmap`. Remove `findDestinationAt` from the imports if it's now unused (keep it in `utils/heatmap.ts` if its tests use it).

  Add a friend stack handler next to the existing friend handler:

```ts
  const handleFriendStackPress = useCallback((stack: FriendStack<FriendTraveling>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flyTo(stack.lng, stack.lat, clusterFlyZoom(null, Math.max(zoomRef.current, 2.5)));
  }, [flyTo]);
```

  Pass it as `onFriendStackPress`.

  Check `flyTo`'s signature with `grep -n "const flyTo" hooks/useFlyTo.ts` (arguments `(lng, lat, zoom)`), and that `ShapeSource`'s ref type has `getClusterExpansionZoom` (`grep -n "getClusterExpansionZoom" node_modules/@rnmapbox/maps/lib/typescript/src/components/ShapeSource.d.ts`). If the method takes a feature id or returns a different type, adapt and record a ruling.

- [ ] **Step 7: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors; all tests pass; `0 errors`.

- [ ] **Step 8: Commit.**

```bash
git add components/search/GlobeMapView.tsx components/search/FriendTravelMarker.tsx "app/(tabs)/search.tsx"
git commit -m "feat(globe): count bubbles, pins and labels by zoom, softer heat, friend stacks"
```

---

### Task 4: 30 new catalog destinations

**Files:**
- Modify: `data/destinations.json`
- Test: `__tests__/functions/catalog.test.ts` (append)

**Interfaces:**
- Consumes: `validateCatalog` (existing); the seed's `center` + `bbox` support (branch base).
- Produces: 90 catalog entries.

- [ ] **Step 1: Write the failing test.** Append to `__tests__/functions/catalog.test.ts`:

```ts
describe('coverage (spec 2026-11-11: few destinations in Africa, the Middle East, East Asia and South Asia)', () => {
  const entries = catalog as (CatalogEntry & { bbox?: { sw: [number, number]; ne: [number, number] }; center?: { lat: number; lng: number } })[];
  it('has the 30 new destinations', () => {
    const slugs = new Set(entries.map((e) => e.slug));
    for (const s of ['serengeti', 'nairobi', 'victoria-falls', 'okavango-delta', 'kruger', 'essaouira', 'mauritius', 'seychelles',
      'petra', 'wadi-rum', 'abu-dhabi', 'doha', 'muscat', 'jerusalem', 'amman',
      'tokyo', 'osaka', 'beijing', 'shanghai', 'taipei', 'busan', 'hokkaido', 'guilin',
      'jaipur', 'goa', 'kathmandu', 'sri-lanka', 'maldives', 'kerala']) expect(slugs.has(s)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(89);
  });
  it('explicit boxes are city-sized and hold their centre (review focus 3)', () => {
    for (const e of entries.filter((x) => x.bbox)) {
      expect(e.bbox!.ne[0] - e.bbox!.sw[0]).toBeLessThanOrEqual(1.6);
      expect(e.bbox!.ne[1] - e.bbox!.sw[1]).toBeLessThanOrEqual(1.6);
      expect(e.center!.lng).toBeGreaterThanOrEqual(e.bbox!.sw[0]);
      expect(e.center!.lng).toBeLessThanOrEqual(e.bbox!.ne[0]);
      expect(e.center!.lat).toBeGreaterThanOrEqual(e.bbox!.sw[1]);
      expect(e.center!.lat).toBeLessThanOrEqual(e.bbox!.ne[1]);
    }
  });
});
```

  The list holds 29 slugs on purpose: Zanzibar is already in the catalog, so it's one of the 30 regions' fills already counted. Recount when adding entries; the total must reach at least 89.

- [ ] **Step 2: Run it to verify it fails.**
  - Run: `npx jest __tests__/functions/catalog.test.ts`
  - Expected: FAIL (slugs missing).

- [ ] **Step 3: Add the entries.** Append to `data/destinations.json`, keeping its 2-space formatting. Each entry has `slug, name, countryCode, countryName, continentChip, vibes, popularity, query, styles`; nature areas add `center` + `bbox`.

```json
  {"slug":"serengeti","name":"Serengeti","countryCode":"TZ","countryName":"Tanzania","continentChip":"africa-middle-east","vibes":["nature","adventure"],"popularity":62,"query":"Serengeti National Park, Tanzania","styles":["adventure","luxury","family"],"center":{"lat":-2.333,"lng":34.833},"bbox":{"sw":[34.2,-3.0],"ne":[35.4,-1.6]}},
  {"slug":"nairobi","name":"Nairobi","countryCode":"KE","countryName":"Kenya","continentChip":"africa-middle-east","vibes":["nature","culture","food"],"popularity":50,"query":"Nairobi, Kenya","styles":["adventure","cultural"]},
  {"slug":"victoria-falls","name":"Victoria Falls","countryCode":"ZW","countryName":"Zimbabwe","continentChip":"africa-middle-east","vibes":["nature","adventure"],"popularity":55,"query":"Victoria Falls, Zimbabwe","styles":["adventure","family"],"center":{"lat":-17.9243,"lng":25.8572},"bbox":{"sw":[25.6,-18.15],"ne":[26.1,-17.7]}},
  {"slug":"okavango-delta","name":"Okavango Delta","countryCode":"BW","countryName":"Botswana","continentChip":"africa-middle-east","vibes":["nature","adventure"],"popularity":45,"query":"Maun, Botswana","styles":["adventure","luxury"],"center":{"lat":-19.3,"lng":22.9},"bbox":{"sw":[22.2,-19.95],"ne":[23.6,-18.6]}},
  {"slug":"kruger","name":"Kruger","countryCode":"ZA","countryName":"South Africa","continentChip":"africa-middle-east","vibes":["nature","adventure"],"popularity":55,"query":"Kruger National Park, South Africa","styles":["adventure","family","luxury"],"center":{"lat":-24.3,"lng":31.5},"bbox":{"sw":[31.0,-25.0],"ne":[32.0,-23.6]}},
  {"slug":"essaouira","name":"Essaouira","countryCode":"MA","countryName":"Morocco","continentChip":"africa-middle-east","vibes":["beaches","culture","food"],"popularity":48,"query":"Essaouira, Morocco","styles":["cultural","budget"]},
  {"slug":"mauritius","name":"Mauritius","countryCode":"MU","countryName":"Mauritius","continentChip":"africa-middle-east","vibes":["beaches","nature"],"popularity":58,"query":"Port Louis, Mauritius","styles":["luxury","family"]},
  {"slug":"seychelles","name":"Seychelles","countryCode":"SC","countryName":"Seychelles","continentChip":"africa-middle-east","vibes":["beaches","nature"],"popularity":55,"query":"Victoria, Seychelles","styles":["luxury","adventure"]},
  {"slug":"petra","name":"Petra","countryCode":"JO","countryName":"Jordan","continentChip":"africa-middle-east","vibes":["culture","adventure"],"popularity":62,"query":"Wadi Musa, Jordan","styles":["cultural","adventure"],"center":{"lat":30.3285,"lng":35.4444},"bbox":{"sw":[35.3,30.2],"ne":[35.6,30.45]}},
  {"slug":"wadi-rum","name":"Wadi Rum","countryCode":"JO","countryName":"Jordan","continentChip":"africa-middle-east","vibes":["adventure","nature"],"popularity":48,"query":"Wadi Rum, Jordan","styles":["adventure","luxury"],"center":{"lat":29.5759,"lng":35.4208},"bbox":{"sw":[35.2,29.3],"ne":[35.7,29.85]}},
  {"slug":"abu-dhabi","name":"Abu Dhabi","countryCode":"AE","countryName":"United Arab Emirates","continentChip":"africa-middle-east","vibes":["culture","beaches","food"],"popularity":58,"query":"Abu Dhabi, United Arab Emirates","styles":["luxury","family"]},
  {"slug":"doha","name":"Doha","countryCode":"QA","countryName":"Qatar","continentChip":"africa-middle-east","vibes":["culture","food"],"popularity":50,"query":"Doha, Qatar","styles":["luxury","cultural"]},
  {"slug":"muscat","name":"Muscat","countryCode":"OM","countryName":"Oman","continentChip":"africa-middle-east","vibes":["culture","nature","beaches"],"popularity":48,"query":"Muscat, Oman","styles":["cultural","adventure"]},
  {"slug":"jerusalem","name":"Jerusalem","countryCode":"IL","countryName":"Israel","continentChip":"africa-middle-east","vibes":["culture","food"],"popularity":55,"query":"Jerusalem","styles":["cultural","family"]},
  {"slug":"amman","name":"Amman","countryCode":"JO","countryName":"Jordan","continentChip":"africa-middle-east","vibes":["culture","food"],"popularity":45,"query":"Amman, Jordan","styles":["cultural","budget"]},
  {"slug":"tokyo","name":"Tokyo","countryCode":"JP","countryName":"Japan","continentChip":"asia","vibes":["food","culture","nightlife"],"popularity":92,"query":"Tokyo, Japan","styles":["cultural","family","luxury"]},
  {"slug":"osaka","name":"Osaka","countryCode":"JP","countryName":"Japan","continentChip":"asia","vibes":["food","nightlife","culture"],"popularity":72,"query":"Osaka, Japan","styles":["cultural","budget"]},
  {"slug":"beijing","name":"Beijing","countryCode":"CN","countryName":"China","continentChip":"asia","vibes":["culture","food"],"popularity":70,"query":"Beijing, China","styles":["cultural","family"]},
  {"slug":"shanghai","name":"Shanghai","countryCode":"CN","countryName":"China","continentChip":"asia","vibes":["food","nightlife","culture"],"popularity":68,"query":"Shanghai, China","styles":["cultural","luxury"]},
  {"slug":"taipei","name":"Taipei","countryCode":"TW","countryName":"Taiwan","continentChip":"asia","vibes":["food","culture","nature"],"popularity":62,"query":"Taipei, Taiwan","styles":["cultural","budget"]},
  {"slug":"busan","name":"Busan","countryCode":"KR","countryName":"South Korea","continentChip":"asia","vibes":["beaches","food","culture"],"popularity":52,"query":"Busan, South Korea","styles":["cultural","budget"]},
  {"slug":"hokkaido","name":"Hokkaido","countryCode":"JP","countryName":"Japan","continentChip":"asia","vibes":["nature","adventure","food"],"popularity":55,"query":"Sapporo, Japan","styles":["adventure","family"]},
  {"slug":"guilin","name":"Guilin","countryCode":"CN","countryName":"China","continentChip":"asia","vibes":["nature","adventure"],"popularity":45,"query":"Guilin, Guangxi, China","styles":["adventure","cultural"]},
  {"slug":"jaipur","name":"Jaipur","countryCode":"IN","countryName":"India","continentChip":"asia","vibes":["culture","food"],"popularity":58,"query":"Jaipur, India","styles":["cultural","budget"]},
  {"slug":"goa","name":"Goa","countryCode":"IN","countryName":"India","continentChip":"asia","vibes":["beaches","nightlife","food"],"popularity":55,"query":"Panaji, Goa, India","styles":["budget","adventure"]},
  {"slug":"kathmandu","name":"Kathmandu","countryCode":"NP","countryName":"Nepal","continentChip":"asia","vibes":["culture","adventure","nature"],"popularity":50,"query":"Kathmandu, Nepal","styles":["adventure","cultural","budget"]},
  {"slug":"sri-lanka","name":"Sri Lanka","countryCode":"LK","countryName":"Sri Lanka","continentChip":"asia","vibes":["beaches","nature","culture"],"popularity":55,"query":"Colombo, Sri Lanka","styles":["adventure","cultural"]},
  {"slug":"maldives","name":"Maldives","countryCode":"MV","countryName":"Maldives","continentChip":"asia","vibes":["beaches","nature"],"popularity":65,"query":"Malé, Maldives","styles":["luxury","family"],"center":{"lat":4.1755,"lng":73.5093},"bbox":{"sw":[73.3,3.9],"ne":[73.7,4.45]}},
  {"slug":"kerala","name":"Kerala","countryCode":"IN","countryName":"India","continentChip":"asia","vibes":["nature","food","culture"],"popularity":48,"query":"Kochi, Kerala, India","styles":["cultural","family"]}
```

  That's 29 entries plus Zanzibar already in the catalog. Every value must pass `validateCatalog`: the chips are europe/asia/americas/africa-middle-east/oceania, the vibes come from beaches/food/adventure/culture/nature/nightlife, and `styles` holds 2–3 of adventure/luxury/budget/family/cultural.

- [ ] **Step 4: Run the catalog tests.**
  - Run: `npx jest __tests__/functions/catalog.test.ts`
  - Expected: PASS. If `validateCatalog` reports a problem, fix that entry's value; never loosen the validator.

- [ ] **Step 5: Dry-run the seed** (no writes, no paid calls).
  - Run: `node scripts/seed-destinations.mjs --dry-run --only serengeti,nairobi,victoria-falls,okavango-delta,kruger,essaouira,mauritius,seychelles,petra,wadi-rum,abu-dhabi,doha,muscat,jerusalem,amman,tokyo,osaka,beijing,shanghai,taipei,busan,hokkaido,guilin,jaipur,goa,kathmandu,sri-lanka,maldives,kerala 2>&1 | tail -6`
  - Expected: `Done — ok: 29, failed: 0`.
  - For any failure, give that entry a more specific `query` (a city, not a province) or an explicit `center` + `bbox` (≤ 1.6°, holding the centre), and re-run.

- [ ] **Step 6: Commit.**

```bash
git add data/destinations.json __tests__/functions/catalog.test.ts
git commit -m "feat(catalog): 29 more destinations across Africa, the Middle East, East Asia and South Asia"
```

  **The paid seed (writes to production) waits for the owner's OK.** After it runs: `node scripts/convert-keyed-covers.mjs` (dry run) must print `0 keyed covers`.

---

### Task 5: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md.** In the `utils/destinations.ts` / `utils/heatmap.ts` bullet (the one describing the globe's pins and `HeatmapLayer`), add:

"**At any distance** (spec `2026-11-11-globe-any-distance-design.md`): the destination source is clustered (`clusterRadius 50`, `clusterMaxZoomLevel 5`) into count bubbles that split as you zoom; tapping a bubble flies to its expansion zoom (`globeTapTarget`, `clusterFlyZoom`, `ShapeSource.getClusterExpansionZoom`); pins and halos grow with zoom; labels are ranked by popularity (`symbolSortKey`) and stay upright when tilted; the heat map is a softer, tighter glow at world view. Friends on trips stack at world view (`friendStacks`: within ~60 px, ≤ 3 faces + `+N`, tap flies in) and spread around shared cities from zoom 4 (`spreadCluster`)."

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: globe at any distance"
```

---

## After the tasks

- **Final review:** a fresh reviewer over `git merge-base main HEAD..HEAD`, with this plan's Review Focus.
- **Seed (owner's OK):** the 29 new destinations, then `convert-keyed-covers` (dry run) to confirm 0.
- **Build (owner's OK):** an iOS-only test build. The globe changes are app code.
