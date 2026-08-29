# Globe POI Discovery — Design

**Date:** 2026-08-28
**Status:** Approved, ready for implementation planning

## Goal

Make the Search tab's Mapbox globe a place users can *scan* — surfacing tappable
places at every zoom, arriving at destinations on an angle rather than straight
down, and giving the screen a Supernova identity instead of generic dark-glass
map chrome.

The write path is already built: `PlaceDetailSheet` has "Add to Trip" wired to
`AddToTripSheet`. **This project is entirely about discovery** — getting the user
in front of a place worth adding. No changes to the add flow.

## Decisions

| Decision | Choice |
|---|---|
| POI strategy | **Hybrid** — own curated layer at low zoom, fixed ambient Mapbox POIs at high zoom |
| Curated layer contents | **Trending public destinations only** (not own trips, saved trips, or a new saved-places collection) |
| Zoom behaviour | **Crossfade** — curated fades out, ambient fades in, one clear layer at any zoom |
| Chrome scope | **Everything**, including the light→dark tab transition |
| Screen palette | Stays always-dark (Architecture Rule 3). Not revisited. |

## Background: what is actually wrong today

`app/(tabs)/search.tsx` already resolves ambient POI taps through
`queryRenderedFeaturesAtPoint` → `extractPoiFromFeatures` → Google Text Search,
with a two-level cache. The plumbing is sound. Four things break the experience:

1. **Nothing is tappable at globe zoom.** Mapbox Standard renders ambient POI
   labels only from ~z14. At the `INITIAL_ZOOM = 1.5` the screen opens at, there
   are zero POI features to hit. "Scan the globe" cannot work through ambient
   labels — a structural limit, not a tuning problem.

2. **Tap misresolution, which costs money.** `extractPoiFromFeatures` returns the
   first feature carrying any `name`, and falls back to the tap coordinates when
   the geometry is not a Point. Rendered features at a point include water,
   landuse, admin polygons and road lines — all named. A near-miss can resolve
   "Pacific Ocean" and then fire a **billed** Google Text Search on it.

3. **No marker is ever rendered.** `search.tsx` contains no `ShapeSource`,
   `CircleLayer` or `SymbolLayer`. The camera flies somewhere and the map shows
   nothing — not even confirmation that the tap registered.

4. **The camera lands flat.** `useFlyTo.flyTo` calls `setCamera` with no `pitch`,
   so every arrival is pitch 0 (straight down), while `StyleImport` sets
   `show3dBuildings: true`. The app renders 3D buildings and then views them from
   directly overhead, where 3D is invisible.

`components/trip/TripMapView.tsx` already solves the marker problem with
`ShapeSource` + `CircleLayer` + `SymbolLayer` and a single unified tap handler.
The search map should follow that established in-repo pattern rather than
inventing a second one.

## Architecture

Five independent units, each landable on its own:

```
utils/trendingPlaces.ts   pure   aggregate + weight + sort destinations
hooks/useTrendingPlaces   data   one cached Firestore query -> TrendingPlace[]
utils/camera.ts           pure   pitchForZoom(), headingForArrival()
services/places/poiTapBridge.ts  pure (revised)  Point-only feature extraction
app/(tabs)/search.tsx     view   layers, crossfade, chrome, transition
```

Pure logic lives in `utils/` so it is unit-testable — this project has no React
Native component-testing library, so anything worth asserting must be pushed out
of the component.

## 1. Trending places layer

### Data

`hooks/useTrendingPlaces.ts` — a single TanStack Query:

- `collection('trips')`, `where('visibility', '==', 'public')`,
  `orderBy('savesCount', 'desc')`, `limit(150)`
- `staleTime: 10 * 60 * 1000`
- **Zero cost per pan or zoom.** One query, cached, independent of camera state.

### Aggregation (`utils/trendingPlaces.ts`, pure)

```ts
export interface TrendingPlace {
  key: string;          // placeId, or "lat,lng" rounded to 3dp
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  placeId: string | null;
  tripCount: number;    // how many public trips go here
  weight: number;       // summed savesCount + likesCount
}

export function aggregateDestinations(trips: Trip[]): TrendingPlace[]
```

Rules:

- Skip destinations with a null `lat` or `lng`. AI-generated trips may carry a
  name only until `useTripCoverResolver` grounds them; an ungrounded destination
  cannot be placed on a map.
- Dedupe on `placeId` when present, else on lat/lng rounded to 3 decimal places
  (~110 m). Two trips to "Paris" become one pin, not two overlapping ones.
- `weight = Σ(savesCount + likesCount)` across the merged trips; `tripCount` is
  the merge count.
- Sort by `weight` desc, then `tripCount` desc, then `name` asc for stability —
  a deterministic order means the map does not reshuffle between renders.
- Return the top 50. Beyond that, pins overlap illegibly at world zoom.

Include `additionalDestinations` as well as the primary `destination`, since
multi-destination trips carry real places there.

### Rendering

A `ShapeSource` (`id="trending-places"`) built from the aggregated list, with:

- `CircleLayer` — fill `DarkColors.brand.purple`, white stroke 1.5. Radius
  interpolated on `weight` between 5 and 11, so the biggest destinations read
  first at world zoom.
- `SymbolLayer` — the place name, offset below the circle, white text with a
  dark halo (matching `TripMapView`'s trip-stop treatment).

Purple fill deliberately differs from `TripMapView`'s day-colored stops: these
are two different vocabularies and must not be confused for each other.

### Firestore index

Requires a composite index on `trips(visibility ASC, savesCount DESC)`. This is a
manual prerequisite — the query fails with a console link until it exists.

## 2. Ambient POI tap reliability

Revise `services/places/poiTapBridge.ts`:

- **Require `feature.geometry.type === 'Point'`.** Drop the tapLat/tapLng
  fallback entirely. Oceans and landuse are polygons; roads are lines; only
  labels are points. This single constraint eliminates the whole misresolution
  class, and is the highest-value change in the file.
- **Pick the nearest candidate**, not the first. When several Point features
  fall inside the query box, choose the one closest to the tap centre.

In `search.tsx`, query a **rect** rather than a single pixel — a 22 pt radius
around the touch, half the 44 pt accessibility target. `queryRenderedFeaturesInRect`
replaces `queryRenderedFeaturesAtPoint`.

Note the argument order: rnmapbox takes the bbox as `[top, left, bottom, right]`,
not the `[minX, minY, maxX, maxY]` most bbox APIs use. Inverting it returns an
empty collection with no error, which would look exactly like "no POI here" —
build the box in a named helper so the order is stated once.

The geometry filter stays in JS inside `extractPoiFromFeatures` rather than being
pushed into the method's native `filter` argument. Native filtering would work,
but keeping it in JS is what makes it unit-testable, which is the reason the
bridge is a separate pure module at all.

Deliberately **not** filtering by layer ID: Mapbox Standard is a fragment style
and its internal layer names are not a stable public contract. Filtering on
geometry type is robust to Standard's internals changing under us.

## 3. Selected-place pin

A second `ShapeSource` (`id="selected-place"`) holding a single point derived
from `usePlacesStore.selectedPlace`:

- Larger circle (radius 13), purple fill, 3 px white ring — visually the same
  family as trending pins but unmistakably the active one.
- Springs in on selection using `SPRING` from `constants/motion.ts`.

This is also the only feedback that a tap registered at all, which the screen
currently lacks entirely.

## 4. Pitched arrival

`utils/camera.ts`, pure:

```ts
export function pitchForZoom(zoom: number): number
export function headingForArrival(lng: number): number
```

`pitchForZoom`:

| Zoom | Pitch | Rationale |
|---|---|---|
| `< 8` | `0` | Country/region. Pitch at low zoom distorts the globe. |
| `8 – 13` | `45` | City. Enough tilt to read depth. |
| `>= 13` | `55` | POI/street. Where `show3dBuildings` finally becomes visible. |

`headingForArrival` returns a small deterministic offset (derived from longitude,
range ±25°) so arrivals are not mechanically north-locked. Deterministic rather
than random: the same place must look the same every time it is visited.

Changes to `hooks/useFlyTo.ts`:

- `flyTo` passes `pitch: pitchForZoom(zoom)` and `heading` to `setCamera`.
- `flyToBounds` must **explicitly reset `pitch` to 0 and `heading` to 0.**
  `fitBounds` does not touch pitch, so flying from a tilted POI out to a country
  would otherwise leave residual tilt and render the region view crooked. This is
  the single easiest thing to get wrong in this section.
- `handleClearQuery`'s reset back to the globe likewise resets pitch and heading.

## 5. Chrome and transition

### Token fixes

- Replace the hand-rolled `rgba(255,255,255,0.15)` borders (`styles.tab`,
  `styles.searchBarBlur`, `styles.searchBarAndroid`) with
  `DarkColors.background.cardBorder` (`#26232E`) — warmer, and already the app's
  hairline token.
- Active tab currently carries three purple signals (fill, border, text). Reduce
  to **one**: purple text on a neutral chip. The design skill treats the accent
  as "a jewel against neutrals"; tripling it spends the accent on chrome.

### Editorial signature

A tracked eyebrow over the idle globe (no query, no selection), reading
`TRENDING NOW · {n} PLACES` where `n` is the live count of rendered trending pins
— not a fixed number. Uses the design system's eyebrow treatment (11 px,
`letterSpacing 0.9`, `text.tertiary`). It labels the curated layer and gives the
screen the editorial voice every light screen already has.

While the trending query is loading, render the eyebrow as `TRENDING NOW` alone
rather than flashing `0 PLACES`.

Hidden as soon as a search or selection is active — it describes the idle state
only.

### Light → dark transition

The design skill names this explicitly: *"The light→dark transition is a
signature moment — fade/scale it, never hard-cut."* `constants/motion.ts` already
documents `Duration.slow` (400 ms) as being for "dark-immersion transitions" —
the token exists and has never been used here.

On tab focus (`useFocusEffect`): a dark overlay pinned over the map fades from
opacity 1 → 0 while the map scales 1.04 → 1.0. This is the pattern the auth
reveal screens already use (per CLAUDE.md, `welcome` / `sign-in` / `sign-up` /
`complete-profile` pin a dark overlay that fades out on first mount), so it is an
established in-repo pattern rather than a new invention.

No reverse animation on blur — tab swaps away are fast and an exit animation
would delay the next screen.

## Testing

Pure-function tests only, per project convention:

- `__tests__/utils/trendingPlaces.test.ts` — dedupe by placeId; dedupe by rounded
  coords when placeId is null; skip null lat/lng; weight summation; deterministic
  sort; top-50 truncation; `additionalDestinations` included; empty input.
- `__tests__/utils/camera.test.ts` — pitch at each zoom band and at the exact
  boundaries (8, 13); heading determinism for the same longitude; heading stays
  in range.
- `__tests__/services/poiTapBridge.test.ts` — Point features accepted; polygon
  and line features rejected; nearest-of-several chosen; unnamed features
  skipped; empty collection returns null.

The crossfade, the layers and the transition are visual and cannot be asserted in
this project's test setup — they are verified on device.

## Risks

**The crossfade is the part most likely to need tuning.** Zoom-interpolated
opacity is straightforward to write; making it read as a handoff rather than a
pop needs adjustment on a real device. Both thresholds ship as named constants at
the top of the file so they can be changed without hunting through interpolation
expressions.

**Section 5's transition touches navigation.** If the overlay fights the tab
bar's own transition, stop and report rather than layering workarounds on top.

## Manual prerequisites

- Composite Firestore index: `trips(visibility ASC, savesCount DESC)`.

## Out of scope

- A standalone saved-places collection. Considered and deliberately declined —
  trending public destinations cover the discovery goal without new Firestore
  collections, rules or write paths.
- Own-trip and saved-trip pins on the globe.
- Any change to `PlaceDetailSheet` or `AddToTripSheet` — the add flow works.
- Revisiting the always-dark decision for this screen.
- `TripMapView` — it shares `poiTapBridge`, so it inherits the Point-only fix,
  but no other change is made to it.
- The "Add to Trip" → "Add to trip" sentence-case fix. Correct per the design
  system, but unrelated to discovery; fold it into a copy pass.
