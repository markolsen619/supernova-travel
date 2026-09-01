# Mapbox-First Activity Grounding — Phase 1

**Date:** 2026-08-31
**Status:** Approved

## Context

AI-generated itineraries arrive ungrounded. `functions/src/generateTrip.ts` writes every activity with
`placeId: null, lat: null, lng: null` and a Gemini-authored `searchQuery` string, deliberately making no
billed Places call at generation time. The client then grounds each stop lazily — one Google Text Search
per stop, on first user interaction — via `enrichPlaceByQuery()` in `services/places/googlePlaces.ts:289`.

Two problems with that arrangement prompted this work.

**1. Stops don't appear on the map without manual effort.** Nothing is grounded until the user taps it or
presses "Locate all" in `components/trip/TripMapView.tsx`. A freshly generated trip opens to an empty map,
and the user is asked to go find their own itinerary.

**2. Grounding resolves against the whole planet.** `enrichPlaceByQuery()` passes only
`{ textQuery, maxResultCount: 1, languageCode }` — no `locationBias`, no `locationRestriction`. Its own
doc comment says "there's no known lat/lng to bias or fall back to", which was true when written but no
longer is: the trip carries a destination and a `countryCode`. A trip to La Paz, Baja California Sur
therefore returns stops from La Paz, Bolivia. Notably `enrichPoiByNameAndCoords()` (line 167) in the same
file already does this correctly, with a 100m `locationBias` circle.

There is also a cost dimension. `enrichPlaceByQuery()` requests `TIER2_LIST_FIELD_MASK`, which includes
`rating`, `userRatingCount`, `priceLevel`, `regularOpeningHours` and `editorialSummary`. Those
atmosphere-class fields put every grounding call in the most expensive Text Search SKU, so a stop costs
$0.04 to convert a name into coordinates — sheet-quality data billed on stops nobody opens.

## Evidence

Ten representative La Paz BCS stop names, resolved through each candidate path. "Correct" means the result
landed within 150km of La Paz BCS.

| Approach | Correct | Silently wrong | Honest miss |
|---|---|---|---|
| Google, no bias (current behaviour) | 8/10 | 2/10 | 0/10 |
| Google + `locationBias` | 10/10 | 0/10 | 0/10 |
| Mapbox + `proximity` | 7/10 | 3/10 | 0/10 |
| Mapbox + hard `bbox` | 9/10 | 0/10 | 1/10 |

Unbiased Google placed "Playa El Tecolote" in San Diego (1,172km) and "Mercado Municipal Francisco E.
Madero" in Brazil (8,718km) — the reported bug, reproduced.

Mapbox's `proximity` is a soft hint and is not sufficient on its own: it returned a Peruvian museum
(5,410km) and an Argentine "Bismarck" (8,532km). A hard `bbox`, by contrast, eliminated every wrong answer.
The two failures became one *correct* result and one honest "no result".

**That asymmetry is the foundation of this design.** A bounded search either succeeds or admits ignorance;
it never persists confident nonsense. Silent wrong data is the only unacceptable outcome for grounding that
runs unattended and writes straight to Firestore.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary grounding provider | Mapbox Search Box, hard `bbox` | ~90% hit rate, zero wrong answers, free to 25,000 req/month (~1,000 trips) |
| Fallback provider | Google Text Search + `locationBias` | Caught the one stop Mapbox missed; ~10% of stops, so cost stays marginal |
| Google field mask for fallback | Grounding-only fields, not `TIER2` | Drops from the Atmosphere SKU ($40/1k, 1k free) to Pro ($32/1k, 5k free) |
| Mappable predicate | `lat && lng`, no longer `placeId && lat && lng` | Mapbox issues no Google place ID; the old predicate would hide every Mapbox-grounded pin |
| When grounding runs | Background pass on trip open | Trip renders immediately, pins fill in progressively; no added wait before the trip is usable |
| Per-day city assignment | `destinationIndex` from Gemini, transport-marker inference as fallback | Multi-country European trips need per-city precision; a union box actively returns wrong answers |
| Last-resort box | Main destination's box, never a union | A too-specific box yields an honest miss that Google's soft bias then resolves; a too-broad box yields confident wrong data |
| Rich place data | Stays Google, on demand only | Mapbox has no photos, ratings, hours, or editorial summaries at any price |

## The grounded/enriched split

The central structural change. Two states that the code currently conflates:

- **Grounded** — has `lat`/`lng`. Sufficient to draw a pin. Cheap, from Mapbox.
- **Enriched** — additionally has a Google `placeId`, photos, rating, hours. Only for stops a user opens.

`components/trip/TripMapView.tsx:72` currently gates pins on `activity.placeId && activity.lat != null &&
activity.lng != null`. Left alone, a Mapbox-grounded stop would carry perfect coordinates and still never
render. This predicate must become coordinate-based.

The upgrade path from grounded to enriched already exists and needs no new code:
`enrichPoiByNameAndCoords(name, lat, lng)` is documented as "Flow B (Mapbox POI tap)" — the path a user's
tap on a Mapbox POI already takes to become a full Google place. A Mapbox-grounded stop is the same shape
of input.

## New module — `services/places/mapboxSearch.ts`

Deliberately narrow. It does not attempt to mirror the Google service's surface.

```
searchPlaceInBounds(query, bbox, center) -> { name, lat, lng, address, mapboxId } | null
resolveCityBounds(name, countryCode)     -> PlaceViewportBounds | null
```

- `searchPlaceInBounds` calls the Search Box `/forward` endpoint with `bbox` (hard restriction),
  `proximity` (ranking hint within the box), `limit=1`, `language=en`. Returns `null` on no result — the
  honest miss the fallback depends on.
- `resolveCityBounds` resolves a destination city with `types=place&country=<cc>` and returns its bounding
  box. City names plus a country filter are the unambiguous case for a geocoder; "La Paz" + `MX` lands in
  Baja California Sur.

Uses the existing `EXPO_PUBLIC_MAPBOX_TOKEN`. No new configuration.

## Provider chain

A small orchestrator, one link deep:

1. `searchPlaceInBounds(query, dayBox)` — free tier, ~90% of stops.
2. On `null`: `enrichPlaceByQuery(query, { bias: dayCenter })` — Google, ~10% of stops.
3. On `null` again: mark the stop as grounding-failed and stop retrying it.

`enrichPlaceByQuery()` gains an optional bias parameter. **This is the smallest useful change in the whole
design and should ship first, on its own** — it fixes the La Paz bug on the existing manual tap-to-locate
path without depending on anything else here.

## Destination bounds

`Destination` gains `bounds: PlaceViewportBounds | null`.

- **AI trips** — destination is a name plus `countryCode`. Resolved through `resolveCityBounds()`. Free.
- **Manual trips** — destination comes from the Google-backed picker, which already returns a `viewport`.
  Converted with the existing `viewportToBounds()` (`googlePlaces.ts:56`). Already paid for.

Persisted once per destination via `UpdateTripInput.destination`, which exists for exactly this kind of
backfill. Multi-city trips resolve a box per entry in `additionalDestinations`.

## Per-day city assignment

Multi-country trips are where generic stop names ("Centraal Station", "Duomo", "Old Town Square") are most
likely to collide, so each day must resolve against its own city's box.

**Primary — `destinationIndex` from Gemini.** The multi-city prompt already presents destinations as a
numbered ordered list and instructs Gemini to allocate days across them. One field added to each day object:

```
"dayNumber": 4,
"destinationIndex": 1     // 0-based index into the numbered destination list
```

Rule to add: `destinationIndex` must be non-decreasing across days, matching the existing instruction that
destinations are visited strictly in listed order.

**Fallback — infer from transport markers.** The multi-city prompt already mandates "exactly one
transport-type activity… titled like *Travel from {previous} to {this}*" on each city's first day
(`generateTrip.ts:283`). Walk days in order and match the arrival city named in that title against the
destination list, carrying it forward until the next marker.

This fallback is **not optional**. Gemini's output is not schema-enforced — it is a raw `JSON.parse` at
`generateTrip.ts:57` — and every trip generated before this change lacks the field entirely.

**Last resort — the main destination's box.** Not a union of all boxes. Constraining a Rome day to the
Paris box makes Mapbox return nothing, which hands the stop to Google's soft `locationBias`, which still
resolves it correctly. A union box would instead return a confident wrong answer from the wrong country.

## Cloud Function changes — `functions/src/generateTrip.ts`

- Multi-city prompt (`buildMultiCityPrompt`): add `destinationIndex` to the day object in the JSON spec,
  plus the non-decreasing rule.
- Single-city prompt: unchanged. Index is always 0.
- Day write (line ~99): persist `destinationIndex: day.destinationIndex ?? null`.
- `GeneratedTrip` type in `functions/src/types.ts`: add the optional field.

No change to activity writing. Stops remain ungrounded at generation time — grounding stays a client
concern, as today.

## Client changes

### `services/places/googlePlaces.ts`
- `enrichPlaceByQuery()` gains an optional location-bias parameter.
- A grounding-only field mask, separate from `TIER2_FIELDS`, for the fallback path.

### `services/places/mapboxSearch.ts` (new)
As described above.

### `app/trip/[id].tsx`
- `handleGroundActivity` (line ~345) routes through the provider chain instead of calling
  `enrichPlaceByQuery` directly.
- A background auto-grounding pass on trip open for AI-generated trips: sequential with light concurrency,
  skipping stops already grounded or already marked failed.
- `unresolvedActivityIds` moves from component state to a persisted per-activity marker (see below).

### `components/trip/TripMapView.tsx`
- Mappable predicate at line 72 becomes coordinate-based.
- "Locate all" remains as the manual retry affordance for stops the automatic pass could not resolve.

### `hooks/useTripCoverResolver.ts`
Unchanged in behaviour, but it is the natural place to also persist the destination's `bounds` while it is
already grounding the destination.

## Data model

| Type | Change |
|---|---|
| `Destination` | `+ bounds: PlaceViewportBounds \| null` |
| `TripDay` | `+ destinationIndex: number \| null` |
| `TripActivity` | `+ groundingFailedAt: Timestamp \| null` |
| `UpdateTripInput` | destination payload carries `bounds` |

## Cost model

Per 25-stop generated trip:

| | Correctness | Cost |
|---|---|---|
| Today | 8/10 | ~$1.00 |
| Pure Google + bias | 10/10 | ~$0.80 |
| Pure Mapbox + bbox | 9/10 | ~$0.00 |
| **This design** | **10/10** | **~$0.08** |

A ~92% reduction with better correctness than the current behaviour. Destination box resolution is free.
Google is billed only on the ~10% of stops Mapbox misses, at the Pro SKU rather than Atmosphere.

**The persisted failure marker is a cost control, not polish.** `unresolvedActivityIds` is currently
component state and dies on unmount. That is harmless while grounding is user-initiated, but under an
automatic pass it means every trip open re-bills every unresolvable stop, indefinitely. Persistence is what
makes the bill bounded.

Deduplicating by normalised `searchQuery` within a trip is a smaller saving on repeated anchors (a hotel, a
central plaza) and is included.

## Error handling and UX

- A stop neither provider resolves keeps its existing unresolved treatment and is not retried automatically.
- "Locate all" stays as the manual escape hatch, now expected to be rarely needed.
- The background pass must not block or interrupt trip rendering; failures are logged, never surfaced as
  modal errors.
- Attribution: Mapbox-sourced geocoding requires Mapbox attribution. The existing "Powered by Google"
  strings relate to Google *photos* and are unaffected, since photos stay on Google.

## Testing

Per the project convention that every test in `__tests__/` is a pure-function test, logic goes into `utils/`
rather than into components:

- Bounding-box derivation from a Google `viewport`, including degenerate and antimeridian-crossing cases.
- `searchQuery` normalisation and deduplication.
- Provider-chain selection: which provider is tried, in what order, and what a miss at each stage produces.
- **Day-to-destination assignment**, covering all three paths: explicit `destinationIndex`, transport-marker
  inference, and last-resort fallback. The inference path serves every pre-existing AI trip, so it needs
  real coverage rather than being treated as a safety net nobody exercises.

## Open questions

- **Mapbox storage licensing.** Mapbox *temporary* geocoding forbids persisting results; Permanent Geocoding
  ($5/1,000, no free tier) permits it. Whether Search Box `/forward` results may be persisted to Firestore
  needs confirmation with Mapbox before launch. If persistence is not permitted under the free tier, the
  fallback is Permanent Geocoding at ~$0.125/trip — still an ~87% saving, but it changes the economics and
  should be settled first.

## Out of Scope

Deliberately excluded from Phase 1; each gets its own spec if pursued.

- POI tap enrichment (`hooks/usePoiTapResolver.ts`) — stays Google.
- Tap-anywhere nearby fallback (`searchNearbyPlaces`) — stays Google.
- Destination autocomplete (`hooks/usePlaceAutocomplete.ts`) — stays Google. Mapbox Search Box bills per
  keystroke on the suggest endpoint, which needs its own debouncing design before it is safe to migrate.
- Trip cover images and the place detail sheet — stay Google. Mapbox has no photo product.
- A cross-user shared place cache in Firestore — a larger saving, but a new shared subsystem.
