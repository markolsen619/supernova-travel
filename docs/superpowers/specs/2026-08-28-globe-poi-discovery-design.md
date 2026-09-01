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
| Zoom behaviour | **Hard zoom cutoff** via native `maxZoomLevel` — no interpolated crossfade |
| Chrome scope | **Everything**, including the light→dark tab transition |
| Tap misses | **Tap-anywhere fallback above z12** — a miss resolves via Nearby Search |
| Navigation affordances | All four: back-to-globe, tap feedback, tappable-looking pins, draggable sheet |
| Shipping order | **iOS first.** Android code paths written but not built or validated this pass |
| Firestore index | Hook degrades to an empty layer when the index is absent — not a blocker |
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

Seven units, each landable on its own:

```
utils/trendingPlaces.ts          pure      aggregate + weight + sort destinations
utils/camera.ts                  pure      pitchForZoom(), headingForArrival()
utils/mapInteraction.ts          pure      shouldFallbackToNearby(), nearbyRadiusForZoom(),
                                           tapBbox()
hooks/useTrendingPlaces.ts       data      one cached Firestore query -> TrendingPlace[]
services/places/poiTapBridge.ts  pure*     Point-only feature extraction (revised)
services/places/googlePlaces.ts  data      + searchNearbyPlaces() (added)
app/(tabs)/search.tsx            view      chrome, sheets, transition
components/search/GlobeMapView.tsx  view    layers, camera, tap handling
```

`search.tsx` is already 678 lines and this adds materially to it. Extract the
map itself — layers, camera wiring and tap handling — into
`components/search/GlobeMapView.tsx`, leaving `search.tsx` responsible for
search, tabs and sheets. Without that split the file becomes the kind of
do-everything module that is hard to reason about and harder to edit reliably.

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

### Zoom handoff — a hard cutoff, not a crossfade

Both trending layers carry `maxZoomLevel: 12`. Mapbox stops drawing them past
that point; Standard's own POI labels come in around z14 on their own. The handoff
is declarative, costs nothing to render, and behaves identically on iOS and
Android because the native SDK enforces it rather than a JS interpolation.

An interpolated opacity crossfade was considered and dropped. It needed on-device
tuning on two platforms to avoid reading as a pop, which is tuning effort spent on
a transition the user never explicitly looks at. `maxZoomLevel` is one prop and
has no failure mode.

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

### The tap-anywhere fallback

Standard declutters labels aggressively — at any zoom it draws only a fraction of
the POIs it knows about. Rendered-feature querying can only ever see what was
drawn, so tap tolerance alone cannot deliver "every POI is clickable."

Worse, the current miss path is a bare `return` after a `console.log`. No haptic,
no marker, no message. A tap that misses is indistinguishable from a broken app,
and this is the single biggest contributor to the screen feeling hard to navigate.

New behaviour when no rendered POI is found:

- **At zoom > 12** — call Nearby Search at the tap coordinates and present the
  closest results. Every tap resolves to something real.
- **At zoom <= 12** — do not call the API. A tap at that scale spans hundreds of
  kilometres, so any result is close to arbitrary and would bill a call to
  produce it. Fly in toward the tap point instead, which is the useful
  interpretation of a tap on a far-out map.

New `searchNearbyPlaces(lat, lng, radiusM)` in `services/places/googlePlaces.ts`,
using the `places:searchNearby` endpoint with the existing TIER1 field mask and
the same auth/error handling as `textSearchFirstResult`. Returns up to 5 results
ordered by distance.

Presentation reuses what already exists: results render as `PlaceResult` rows in
the existing bottom sheet under a "Places near here" heading. No new chooser UI.
A single result selects directly, skipping the list.

Cost control:

- Fires only on a deliberate tap that missed — never on pan, zoom, or render.
- Radius scales with zoom (roughly 150 m at z16, 500 m at z13) so the query is
  proportionate to what the user can see.
- Results cache in `usePlacesStore` keyed by coordinates rounded to 4 dp
  (~11 m), so re-tapping the same spot is free.
- An empty result set shows an honest empty state — "No places found here" —
  never silence.

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

## 6. Navigation affordances

Four changes, all aimed at the same problem: the map currently gives the user no
way to tell what is interactive or how to get back.

### Back-to-globe control

A floating button (Phosphor `Globe`, duotone) in the lower-right, above the tab
bar, appearing once zoom exceeds 6. Flies back to `INITIAL_COORDS` / `INITIAL_ZOOM`
with pitch and heading reset, and clears any selection.

Today the only route back to the world view is clearing the search field — an
interaction nobody will discover, and one that is not obviously a camera control
at all.

Requires tracking the live zoom, via `onCameraChanged` on `MapView`. **That event
is high-frequency** — it fires continuously through a pinch. Store the zoom in a
ref and only lift it into state when it crosses the threshold, or every render
during a gesture will re-render the whole screen.

### Immediate tap feedback

`handleMapPress` currently does its haptic *after* resolution succeeds, so a tap
that misses is silent and a tap that hits feels delayed by a network call.

Move a `Light` haptic to the very top of the handler, before any async work, and
render a brief pulse at the tap point — a circle scaling out and fading, using
`SPRING` from `constants/motion.ts`. The tap is acknowledged in the same frame it
happens, regardless of what resolution eventually finds.

### Tappable-looking pins

Trending pins get a soft outer halo — a second `CircleLayer` beneath the main
one, larger radius, low-opacity purple — so they read as interactive targets
rather than flat map decoration.

Chosen over an animated pulse deliberately: Mapbox layer properties cannot be
driven by React Native's `Animated` without per-frame `setState`, which would be
a real performance cost for a decorative effect. A static halo achieves the
affordance with none of it.

### Draggable results sheet

The results sheet is currently dismiss-or-nothing — while it is open the map
behind it cannot be seen at all, which makes searching and looking mutually
exclusive.

Add a `PanGestureHandler` (`react-native-gesture-handler` is already a
dependency) with two snap points: **expanded** (current position) and
**peek** (~35% height, enough for two result rows). Velocity decides the snap on
release; the existing `slideAnim` `Animated.Value` is reused so there is one
source of truth for the sheet's position, not two competing animations.

This is the largest of the four and the one most likely to interact badly with
the `ScrollView` inside the sheet — the gesture must yield to the scroll view
when the list is scrolled away from its top, or dragging the list will fight the
sheet.

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
- `__tests__/utils/mapInteraction.test.ts` — `shouldFallbackToNearby(zoom)` true
  above 12 and false at/below it, including the exact boundary; nearby radius
  scales down as zoom increases; tap-bbox helper emits `[top, left, bottom,
  right]` in that order.

The layers, the transition and the sheet gesture are visual and cannot be
asserted in this project's test setup — they are verified on device. **iOS this
pass**; Android verification is deferred (see Cross-platform). The pure functions
above are platform-agnostic and cover the logic that would otherwise be at risk
of drifting between the two.

## Cross-platform

**iOS ships first; Android follows in a later pass.** That defers *validation*,
not *compatibility* — nothing here may be built in an iOS-only way. Writing
Android-compatible code costs almost nothing now; retrofitting it later is
expensive. Every decision below stands regardless of shipping order, so the
Android pass is verification rather than a rewrite.

Concretely, that means the `maxZoomLevel` handoff (rather than a JS crossfade
tuned per platform), the BlurView fallback branch, and gesture composition care
all stay in scope now, even though nobody will run them on Android this pass.

### Known Android debt: `@rnmapbox/maps` has no Expo config plugin registered

`@rnmapbox/maps` ships an Expo config plugin (`node_modules/@rnmapbox/maps/plugin/`)
and **it is not listed in `app.json`**. The repo has a prebuilt `ios/` directory
and no `android/` directory, no `gradle.properties` and no `.netrc`.

On Android, Mapbox's SDK comes from a private Maven repository that needs a
download token supplied at build time. The config plugin is what injects it.
Without the plugin registered, the first Android prebuild will fail to resolve
the Mapbox SDK — which means **the globe has almost certainly never run on
Android**, and no amount of work in this spec would change that on its own.

The credential is already half-wired: `.env.local.example` documents
`MAPBOX_SECRET_DOWNLOAD_TOKEN` and even gives the `eas secret:create` command.
Only the plugin registration is missing:

```json
["@rnmapbox/maps", { "RNMapboxMapsDownloadToken": "<sk. token>" }]
```

Deferred with the rest of the Android work, but recorded here because it is the
reason an Android build cannot simply be run at the end of this project to "check
Android" — it will fail at dependency resolution, before any code in this spec is
reached. Budget it as its own piece of work, not a final checkbox.

### BlurView has no Android equivalent

`search.tsx` already handles this: `Platform.OS === 'ios'` renders `BlurView`,
Android renders a solid `DARK_SCRIM_96` view. Every new piece of floating
chrome — the back-to-globe button, the eyebrow, the tap pulse — follows the same
branch. Do not introduce blur without its solid fallback.

The draggable sheet in particular has to work against **both** branches, since
the sheet body is a different component per platform.

### Gesture composition differs by platform

`PanGestureHandler` over a nested `ScrollView` resolves differently on iOS and
Android; a composition that feels right on one can be unusable on the other.
Build it with `simultaneousHandlers` wired from the start rather than tuned to
iOS behaviour alone — the Android pass should be a test, not a redesign. When
Android is validated, test the drag on physical hardware, not only the emulator,
where fling velocity does not match.

Haptics also differ: `expo-haptics` maps to a coarser vibration on Android. The
tap-feedback pulse must carry the interaction visually on its own, and never rely
on haptics alone to confirm a tap registered.

## Risks

**Section 5's transition touches navigation.** If the overlay fights the tab
bar's own transition, stop and report rather than layering workarounds on top.

**The draggable sheet and its inner ScrollView will compete.** Gesture
composition between a pan handler and a nested scroll view is the classic source
of a sheet that either cannot be dragged or cannot be scrolled. If it does not
resolve cleanly with `simultaneousHandlers`, fall back to a drag handle that is
the only draggable region — a smaller but reliable interaction — rather than
shipping a sheet that fights the user.

**The fallback introduces a per-tap billed call.** It is bounded by the z12 gate,
the coordinate cache and miss-only firing, but it is a real cost that scales with
engagement. Worth watching in the Places console after release; if it runs hot,
the gate moves up from z12 rather than the feature being removed.

## Manual prerequisites

- Composite Firestore index: `trips(visibility ASC, savesCount DESC)`.
  **Not blocking** — `useTrendingPlaces` catches the failed-precondition error and
  returns an empty list, so the globe renders without trending pins until the
  index exists. Everything else in this spec stays testable meanwhile.

### Deferred to the Android pass

- Register the `@rnmapbox/maps` Expo config plugin in `app.json` with the Mapbox
  download token, and get a green Android build.
- Validate the sheet drag, haptics and blur fallbacks on physical Android
  hardware.

## Out of scope

- A standalone saved-places collection. Considered and deliberately declined —
  trending public destinations cover the discovery goal without new Firestore
  collections, rules or write paths.
- Own-trip and saved-trip pins on the globe.
- `AddToTripSheet` and the add-to-trip flow itself — already built and working.
- `PlaceDetailSheet`'s **content and actions**. Note this is narrower than it
  first appears: `slideAnim` is shared between the results sheet and
  `PlaceDetailSheet` (`search.tsx` passes the same `Animated.Value` to both), so
  making the results sheet draggable necessarily touches how `PlaceDetailSheet`
  is positioned. Either give the two sheets independent animated values, or apply
  the drag to both consistently — but do not assume `PlaceDetailSheet` is
  untouched by section 6.
- Revisiting the always-dark decision for this screen.
- `TripMapView` — it shares `poiTapBridge`, so it inherits the Point-only fix,
  but no other change is made to it.
- The "Add to Trip" → "Add to trip" sentence-case fix. Correct per the design
  system, but unrelated to discovery; fold it into a copy pass.
