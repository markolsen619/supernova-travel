# Discovery (Explore, destination pages, globe heat map) and the immersive trip map

Status: approved in conversation 2026-09-30 · Target: 1.0.1+ (TestFlight per part)

## Intent

Supernova should feel immersive and help people decide where to go, then turn
that into a trip — and it must do so cheaply, leaning on Mapbox (already paid
for, generous free tiers) rather than Google Places.

What the user asked for, in their words: destinations to look through on
Explore "for itineraries and locations"; heat maps on the Search globe with
Mapbox; trip-page maps that stop looking "terrible" and animate "like the
AllTrails map", showing the trip being planned and, afterwards, "the trip they
actually took".

Constraints that shaped the design:

- **Day-one content.** The database holds one public trip and four posts with
  no coordinates. Anything built only from community data is empty at launch.
- **Cost.** Google Places is the expensive dependency; the code already has
  cost guards and a shared place cache. Mapbox map loads, terrain and Search
  Box are within free tiers; Directions is 100k requests/month free.
- **No location permission.** App Review was told the app never requests
  location. Nothing here changes that.
- **Held functions.** Quota/sharing changes on `main` wait for 1.0 approval.
  New functions here deploy individually (`--only functions:<name>`) and never
  redeploy the held ones.

Decisions taken with the user: heat map = world baseline + community;
Explore = photo grid + region/vibe chips; itineraries = editorial + community +
"Plan with AI"; places = ranked from itinerary stops; ~60 destinations; actual
trip = stops marked visited (no GPS); build order trip map → data → Explore.

## Part 1 — Immersive trip map (`components/trip/TripMapView`)

### Map

- Mapbox Standard (unchanged) plus terrain: a `RasterDemSource`
  (`mapbox://mapbox.mapbox-terrain-dem-v1`) with `Terrain` exaggeration ~1.3,
  and `Atmosphere`/sky. Pitch follows `utils/camera.ts` (flat at overview,
  ~55° close in).

### Routes

- Each consecutive pair of grounded stops is a **leg**. Mode per leg, pure
  `legMode(a, b)`:
  - `flight` activity at either end, or great-circle distance > 400 km → `arc`
  - `transport` activity whose title/notes say ferry/boat → `arc`
  - distance < 2.5 km → `walking`
  - otherwise → `driving`
- `walking`/`driving` legs call Mapbox Directions
  (`/directions/v5/mapbox/{profile}/{lng,lat;lng,lat}?geometries=polyline6&overview=full`)
  with `EXPO_PUBLIC_MAPBOX_TOKEN`. A failed or empty response caches as `arc`.
- `arc` legs are computed locally (great-circle interpolation, ~32 points).
- **Cache**: one document `trips/{tripId}/routes/cache` with
  `legs: { [legKey]: { mode, polyline, meters } }`. `legKey` =
  `${mode}:${lat1.toFixed(5)},${lng1.toFixed(5)}>${lat2…},${lng2…}` so planned
  and actual routes share legs and a moved stop naturally misses. One read per
  trip open. Only the owner/collaborators fetch missing legs and write them
  (merge); viewers render cached legs and draw arcs for the rest in memory.
- Firestore rules: `match /trips/{tripId}/routes/{docId}` — read if the trip is
  readable (same `canReadTrip` shape as `days`), write if `canWriteTrip`.
  Additive; safe to deploy during review.

### Stops

- Close in: `MarkerView`s rendering the existing `StopStateBubble` (type icon,
  day colour, visited/current state) with a small number badge. Only the
  selected day's stops (or all, when ≤ 40) are markers, to bound native views.
- At overview (zoom < ~11): a `CircleLayer` of plain day-coloured dots.
- Tap → camera flies to the stop, pitched; the existing stop card appears.

### Flyover

- **Play** control. For each day in order: the day's legs are joined into one
  coordinate path and drawn with `Animated.RouteCoordinatesArray` +
  `Animated.ShapeSource`; the camera follows by `setCamera` along sampled points
  of the path with bearing toward the next point; stops spring in (house
  spring) as the line reaches them; a bottom card shows `DAY 2 · SAT, NOV 25`
  and the current stop. Pause/resume, day chips to jump.
- `AccessibilityInfo.isReduceMotionEnabled()` → no flyover; routes drawn fully.

### Planned vs actual

- Shown once `trip.status === 'completed'`, the end date has passed, or any
  stop is visited: a **Planned | Actual** segmented control.
- Actual = visited stops sorted by `visitedAt` (ties by day/order), routed with
  the same legs; planned drawn at ~25% opacity beneath. Replaying Actual ends
  on an overview with totals (km from leg `meters`, stops visited, days) and a
  link to `TripRecapSheet`.

### Pure modules (tested)

`utils/tripRoutes.ts`: `legMode`, `legKey`, `greatCircleArc`, `decodePolyline6`,
`routeForStops(stops, cache)` (→ coordinates + missing legs),
`actualStopOrder(days)`, `routeDistanceMeters`.
`services/mapboxDirections.ts`: the one network call.

## Part 2 — Catalog and discovery data

### Catalog

- `data/destinations.json` (source of truth, reviewed in git), ~60 entries:
  `slug, name, countryCode, countryName, continentChip ('europe' | 'asia' |
  'americas' | 'africa-middle-east' | 'oceania'), vibes[] (beaches, food,
  adventure, culture, nature, nightlife), center {lat,lng}, bbox {sw,ne},
  popularity (1–100)`. Every chip must have ≥ 4 destinations.
- Seeded to Firestore `destinations/{slug}` plus `coverImageUrl`, `order`.

### Seed script (`scripts/seed-destinations.mjs`, Admin SDK, run by hand)

Needs a service-account key (created once in Firebase console, kept out of
git) and an editorial account "Supernova" (`users/{uid}` with a verified-style
profile). Per destination, idempotent (skips work already done):

1. Cover: Google Text Search → first photo name → `photoUrl` (once).
2. Editorial itineraries: 2–3 per destination via the existing prompt builder
   (`functions/src/generateTrip.ts` `buildPrompt`, varied style/length),
   written as public trips by the editorial account with
   `isEditorial: true`, `destinationKeys: [slug]`.
3. Ground every stop server-side (Mapbox Search Box inside the bbox, Google
   Text Search fallback) — editorial trips are never opened by their owner, so
   client-side lazy grounding would never run.

A failure skips that destination and is reported at the end; re-running
continues where it stopped.

### `tagTripDestinations` (Firestore trigger on `trips/{id}`)

Pure `destinationKeysFor(trip, catalog)`: slugs whose bbox contains the trip's
primary or any additional destination coordinates. Writes only when changed
(guards its own re-trigger). Community trips thus appear on destination pages.

### `aggregateDiscovery` (scheduled daily; also callable by an admin)

Reads public, non-hidden trips with `destinationKeys` and their grounded stops.

- Per destination, writes `topPlaces` (≤ 12: name, type, lat, lng, placeId,
  `itineraryCount`), `itineraryCount`, `communityTripCount`.
  Ranking: stops keyed by placeId, else name + rounded coords; score =
  itineraries containing the stop, ties by saves.
- Writes `aggregates/heatmap`: `points: [lng, lat, weight][]`, rounded to 4
  dp, capped at 4,000 (highest weight kept), `updatedAt`.
  - World baseline: each destination's `popularity`, spread over 5 points
    jittered deterministically inside its bbox.
  - Community: each grounded public stop, weight 1 + 2·saves + 1·likes of its trip.
- One batched write per run.

Rules: `destinations/*` and `aggregates/*` readable by signed-in users,
written only by the Admin SDK.

### Pure modules (tested)

`functions/src/discovery.ts` (no firebase-admin): `destinationKeysFor`,
`rankTopPlaces`, `buildHeatPoints`, `baselinePoints`.

## Part 3 — Explore, destination pages, heat map

### Explore (`app/(tabs)/explore.tsx`)

Header (star + "Explore" + wallet) → region chips row → vibe chips row (one
active per row, spring) → destination grid (`useLayout().columns`; tall photo,
bottom gradient, eyebrow `PORTUGAL · 6 TRIPS`, name) sorted by popularity →
"Latest trips" → "People to follow". "Trending destinations" row removed.
Empty filter result: icon + "No destinations match yet" + description +
"Clear filters". Skeleton cards while loading.

Data: `useDestinations()` reads the `destinations` collection once
(~60 reads, `staleTime` 12 h). Filtering is pure `filterDestinations`.

### Destination page (`app/destination/[slug].tsx`, full-screen push)

Hero photo, eyebrow `MEXICO · NORTH AMERICA`, title, vibe tags; primary CTA
**Plan my trip here** (hero variant) → `/trip/ai-generate` prefilled
(destination, countryCode, placeId when known); Itineraries (editorial first,
"Supernova pick" badge, then community) via
`where('visibility','==','public')`, `where('destinationKeys','array-contains', slug)`,
`orderBy('savesCount','desc')` — **needs a composite index, declared and
deployed in the same change**; Places to go from `topPlaces`, each with its
`ACTIVITY_ICONS` icon and "in N of M itineraries", tap → `PlaceDetailSheet`
(Google detail only on open, via the shared cache). Moderation filtering on
the itinerary list. Added to `usesReadingColumn()` for iPad.

### Globe heat map (`components/search/GlobeMapView`)

`useHeatmap()` reads `aggregates/heatmap` once (`staleTime` 12 h) and feeds a
`HeatmapLayer` under the existing trending layers. Paint: `heatmapWeight` from
the point weight; colour ramp transparent → deep violet → brand pink → pale
amber; radius and intensity interpolate with zoom; opacity 1 → 0 between zoom
7 and 10 so pins and POIs take over. Missing data → no layer. Search results
include catalog destinations (name match) → destination page.

## Error handling summary

Unroutable leg → cached arc. Missing heat/catalog → today's globe and a
"Latest trips"-only Explore. Seed failures skip and report. Aggregation writes
atomically. Every new fetch is wrapped so a failure never blocks a screen.

## Testing

Pure-function Jest tests for every module listed above (this repo has no
component renderer). Visual verification on the simulator per part, shut down
immediately afterwards. Each part ships to TestFlight separately.

## Out of scope

GPS tracking; photo-EXIF placement; per-user personalised heat; editing the
catalog from inside the app; routing inside the flyover for arcs beyond the
great-circle curve.
