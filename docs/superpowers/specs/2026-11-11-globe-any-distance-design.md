# Search globe that works at any distance — design

**Date:** 2026-11-11 · **Owner approved:** sections 1–3 in chat (2026-11-11) · **Builds on:** `2026-10-11-trending-destinations-design.md`, `2026-10-12-friends-on-trips-design.md`

## Why

The owner tested on device (2026-11-11, with 60 destinations seeded). Two problems:

- **Blobs over Europe.** At world zoom the Search globe turns Europe into one blob. Every destination draws a fixed-size halo (11–19 px), a pin and a label, whatever the zoom. The heat map's blur radius (18 px at zoom 4) merges cities, and its density saturates to the "hot" colour.
- **Empty regions.** Africa, the Middle East, East Asia, China and South Asia have few catalog destinations, so the globe looks empty there.

The owner's goal: "continues to look good and function good from any distance and viewpoint".

## Goals

1. **No overlapping pins or labels, at any zoom or tilt.** Crowded areas group into count bubbles that split as you zoom in.
2. **Trending heat reads as a soft glow under the markers,** not a blob.
3. **Friends on trips stay visible and tappable at every distance.**
4. **About 30 new destinations** in the regions that have few, for about 90 in total.
5. **No new running cost:** the layers render on the phone. Seeding costs about $1–2, once.

## 1. What the traveler sees

### World view (zoom < ~4)

- **Bubbles.** Destinations within about 50 px merge into a **bubble with a count**, using Mapbox `ShapeSource` clustering.
  - The bubble's radius grows with the count: 16 px for 2, up to 28 px for 25 or more.
  - Its fill is brand purple at 0.85 with a white 1.5 px ring; the count is white, semibold, 12 pt.
  - A lone city stays a pin.
- **Heat map.** It sits under the bubbles as a soft glow:
  - radius 4 px at zoom 0, 10 px at zoom 3, 22 px at zoom 6;
  - intensity 0.35 at zoom 0, 1.2 at zoom 6;
  - the colour ramp's top (pale amber) is reached only at density 0.95 or more.

### Tapping

- **A bubble** flies the camera to its centre at `getClusterExpansionZoom` (+0.2), over 900 ms (`flyTo`), so the group splits.
- **A city pin** opens `/destination/[slug]`, as today.

### Continent to city (zoom ~4–10)

- `clusterMaxZoom: 5`: everything is a city pin by zoom 6.
- Pins and halos scale with zoom:
  - pin radius 4 px at zoom 2 to 8 px at zoom 8, plus a weight bonus up to 3 px;
  - halo radius 9 to 16 px.
- **Labels are ranked by popularity** (`symbolSortKey: -popularity`) and use Mapbox's own collision handling, so overlapping labels hide the less popular one. Labels are viewport-aligned and upright at any pitch or rotation (`textPitchAlignment: 'viewport'`, `textRotationAlignment: 'viewport'`).
- The heat map fades out between zoom 7 and 10, as now.

### Friends on trips

- Avatars always draw **above** bubbles and pins (`MarkerView`s, as now).
- **At zoom < 4,** friends within about 60 px merge into an **avatar stack** of up to 3 faces plus `+N`. Tapping it flies in, the same as a bubble.
- **At zoom ≥ 4,** friends sharing a city spread apart (`spreadCluster`, unchanged), and tapping an avatar opens their trip.
- Avatar taps win over the bubble or pin underneath.
- The privacy rules are unchanged: followed people only, Public/Followers trips, today's city only, `showOnGlobe`, and blocks.

### Unchanged

The search bar, "Trending now · N destinations", the destination page, and the POI behaviour close in.

## 2. Coverage: about 30 new destinations

These go in `data/destinations.json` with `slug`, `name`, `country`, `countryCode`, `region`, `vibes`, `popularity` and `query`. Nature areas also get an explicit `center` + `bbox` (supported since 2026-11-11).

| Region | Destinations |
|---|---|
| **Africa** | Serengeti (box), Nairobi, Victoria Falls (box), Okavango Delta (box), Kruger (box), Essaouira, Mauritius, Seychelles |
| **Middle East** | Petra (box), Wadi Rum (box), Abu Dhabi, Doha, Muscat, Jerusalem, Amman |
| **East Asia / China** | Tokyo, Osaka, Beijing, Shanghai, Taipei, Busan, Hokkaido (Sapporo query), Guilin |
| **South Asia** | Jaipur, Goa, Kathmandu, Sri Lanka (Colombo query), Maldives (Malé query, box), Kerala (Kochi query) |

**Seeding:**

1. Dry run, `node scripts/seed-destinations.mjs --dry-run --only …`. Fix any entry that fails the city-size check with a better query, or with `center` + `bbox`.
2. Seed with the owner's OK. This uses the fixed seed: key-less covers with `coverPlaceId`, and two editorial trips each.
3. Run `node scripts/convert-keyed-covers.mjs` (dry run) to confirm 0 keyed covers.

The cities appear on the globe, in Explore and on the AI generating screen without an app build. The bubbles and the heat retune need one.

## 3. Build

### `components/search/GlobeMapView.tsx`

- The destination `ShapeSource` gets `cluster`, `clusterRadius={50}`, `clusterMaxZoomLevel={5}` and `clusterProperties` (summing popularity, for the bubble size).
- Layers:
  - `destination-cluster`: a `CircleLayer` filtered on `['has','point_count']`;
  - `destination-cluster-count`: a `SymbolLayer` showing `point_count_abbreviated`;
  - the halo, pin and label layers, filtered on `['!',['has','point_count']]`, with the zoom-interpolated sizes and `symbolSortKey` above.
- The heat map style is retuned as described in section 1.

### Tap handling

`utils/heatmap.ts` gets a new pure `globeTapTarget(features)`, which returns one of:

- `{ kind: 'friend', uid }`
- `{ kind: 'cluster', clusterId, coordinates }`
- `{ kind: 'destination', slug }`
- `null`

Priority runs friend, then cluster, then destination. The globe's `onPress` uses it. For a cluster it asks the source for its expansion zoom (`getClusterExpansionZoom`) and flies there.

### Friends

`utils/friendsTraveling.ts` gets `friendStacks(entries, zoom, pixelsPerDegree)`:

- below zoom 4, entries within about 60 px group into stacks of `{ center, faces: up to 3, extra }`;
- at zoom 4 and above, it defers to `spreadCluster`.

`FriendTravelMarker` gains a stack mode with overlapping 28 px avatars and a `+N` pill.

### Popularity

The destination features carry `popularity` (they already carry `weight`), for `symbolSortKey`.

## Testing

Pure tests:

- **`globeTapTarget`:** priority, empty input, and cluster features.
- **`friendStacks`:** grouping by pixel distance below zoom 4; at most 3 faces, plus `extra`; it defers to `spreadCluster` from zoom 4; a single friend stays single.
- **`destinationPinFeatures`:** carries `popularity`.
- **Catalog:** every new entry has the required fields, and any `bbox` is city-sized (≤ 1.6°).

On a device, in an iOS test build: world, continent and city zooms, tilt and rotation, bubble taps, friend stacks.

## Out of scope

Changing what "trending" counts, new marker art, POI layers, and server changes (the catalog seed is a one-off script run).
