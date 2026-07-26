# Multi-Destination Trips — Phase 1

**Date:** 2026-07-25
**Status:** Approved

## Context

Today a `Trip` has exactly one `destination` (`{ name, placeId, lat, lng, countryCode }`), set once at
creation and never expanded. Both trip-creation flows — the manual wizard (`app/trip/new.tsx`) and the
AI generator (`app/trip/ai-generate.tsx` / `components/trip/AiPromptForm.tsx`) — only let a user pick a
single place, which breaks down for any multi-city trip ("Europe Trip 2026" spanning Paris, Rome, and
Barcelona). `destination` is read in 21 files across the app (trip cards, cover-photo resolution,
Algolia sync, packing templates, the trip map, boarding-pass/reservation linking, etc.), so this is a
real data-model change, not a small UI tweak.

This is **Phase 1** of a two-phase project. Phase 1 makes multi-destination trips fully creatable and
visible. **Phase 2** (separate design session, later) teaches the `generateTrip` Cloud Function to
actually plan a coherent day-by-day itinerary split across multiple cities (day allocation per city,
visit order, inter-city transitions) — Phase 1 stores the destination list but Gemini still receives one
combined prompt built around the primary destination.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data model | `destination` stays as-is (primary); new `additionalDestinations: Destination[]` (default `[]`) holds the rest, in visit order | Zero migration for existing trips (missing field reads as `[]`); every one of the 21 existing single-destination consumers keeps working unchanged by continuing to read `destination` alone |
| Shared type | Extract the inline `{ name, placeId, lat, lng, countryCode }` shape into a named `Destination` interface in `types/index.ts` | `destination` and `additionalDestinations` need the identical shape; naming it once avoids duplicating the inline type |
| Scope | Both manual wizard and AI-generate form | User explicitly wants both; AI form just collects the list for now — Gemini prompt logic is Phase 2 |
| Ordering | Ordered list, reorderable via drag | Visit order matters for planning a route and will matter more once Phase 2 needs to know city sequence — building it ordered now avoids a data shape change later |
| Reorder mechanism | `react-native-draggable-flatlist` (already a project dependency, used for activity reordering) | Reuses an existing, already-integrated pattern rather than adding a new drag library |
| Cap | 10 total destinations (primary + up to 9 additional) | Covers any realistic multi-city trip without unbounded list UI or, later, unbounded Gemini prompt input |
| Auto-title | Comma-joined city list ("Paris, Rome & Barcelona") for 2+ destinations; unchanged "Trip to {city}" for one | User confirmed; still fully overridable, matching today's auto-fill-until-user-types behavior |
| UI reuse | One shared `components/trip/DestinationListEditor.tsx` used by both the manual wizard and the AI form | The add/reorder/remove UI is identical in both places — build once |
| Trip display | Trip detail screen (`app/trip/[id].tsx`) gets a small "Also visiting: X, Y" line; `TripCard` unchanged (primary destination only, card is too small for a full list) | Keeps the feature visible after creation without redesigning every trip-list surface |
| Explicitly out of scope this phase | Multi-destination awareness in the trip map, cover-photo resolution, packing templates, and Algolia search index | All four continue keying off the primary `destination` only; richer per-destination behavior (map pins per city, climate-aware packing per city) is future scope beyond even Phase 2 |

## Data Model

### `types/index.ts`

New named interface, extracted from the inline shape `Trip.destination` already uses:

```ts
export interface Destination {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
}
```

`Trip.destination: Destination` (unchanged shape, now named). New field:

```ts
  /** Additional stops beyond the primary destination, in visit order. Empty
   * for single-destination trips (the overwhelming majority). Capped at 9
   * (10 total including the primary) — see DestinationListEditor. Every
   * existing single-destination consumer (cover photo, map, packing
   * templates, Algolia sync) intentionally reads only `destination` and
   * ignores this field for now — see Phase 1 spec's "out of scope" list. */
  additionalDestinations: Destination[];
```

`CreateTripInput` gains the same `additionalDestinations: Destination[]` field (required, defaults to
`[]` at the call site — not optional on the type, so every creation path has to make an explicit
choice rather than silently omitting it).

### Firestore

No migration needed. Existing trip documents have no `additionalDestinations` field; every read site
does `trip.additionalDestinations ?? []`.

## Manual Wizard (`app/trip/new.tsx`)

- Step 1 (`Step1Destination`) gains a "+ Add another destination" action below the primary destination
  chip, opening the same `DestinationPicker` modal already used for the primary pick. Selecting a place
  appends it to `additionalDestinations` (capped — the add action hides once 10 total are reached).
- The additional-destinations list renders via the new shared `DestinationListEditor` (below), directly
  under the primary destination field.
- Step 3's title auto-fill logic changes from `` `Trip to ${destination}` `` to: for 0 additional
  destinations, unchanged; for 1+, `` `${allDestinationNames.join(', ').replace(/, ([^,]*)$/, ' & $1')}` ``
  (an "A, B & C" join — Oxford-comma-free, matching common trip-name phrasing).
- Step 4's review screen lists every destination (primary + additional), not just the primary.

## AI-Generate Form (`components/trip/AiPromptForm.tsx` / `app/trip/ai-generate.tsx`)

- Same `DestinationListEditor` reused directly below the existing single-destination picker field.
- `ai-generate.tsx` gains `additionalDestinations: Destination[]` state, threaded into `AiPromptForm`
  the same way `startDate`/`endDate` were wired in the previous change.
- The generated trip is created with the full destination list stored, but the Gemini prompt itself
  (`buildPrompt()` in `functions/src/generateTrip.ts`) is **unchanged in Phase 1** — it still only
  references the primary destination. This is the explicit phase boundary: the itinerary Gemini
  produces will only cover the primary city until Phase 2 teaches it to split across all of them.

## Shared Component: `components/trip/DestinationListEditor.tsx`

New component, used identically by both flows above:

- Props: `destinations: Destination[]` (the additional ones — primary is handled separately by each
  caller's existing single-destination field), `onChange: (next: Destination[]) => void`, `maxTotal`
  (10, minus however many are already used by the primary — effectively `9` in both current call
  sites since both always have exactly one primary).
- Renders each destination as a draggable row (`react-native-draggable-flatlist`) with a remove (X)
  button, plus an "+ Add another destination" action (hidden once `destinations.length >= maxTotal`)
  that opens `DestinationPicker` and appends the selection on confirm.
- Drag reordering updates the array order directly (no separate "confirm reorder" step — matches how
  the app's existing activity-reordering already behaves, per CLAUDE.md's `react-native-draggable-flatlist`
  usage note).

## Trip Display (`app/trip/[id].tsx`)

When `trip.additionalDestinations.length > 0`, a small secondary line appears near the existing
destination header: "Also visiting: {comma-joined names}". No other trip-detail layout changes.

## Out of Scope (Phase 1)

- Teaching Gemini to plan a real multi-city itinerary (day allocation per city, ordering, inter-city
  transitions) — this is Phase 2, a separate design session.
- `TripCard` showing anything beyond the primary destination.
- The trip map (`components/trip/TripMapView`) showing pins/routes for anything beyond the primary
  destination.
- Cover-photo resolution (`useTripCoverResolver`) grounding or resolving photos for anything beyond
  the primary destination.
- Packing-template generation (`services/packingTemplates.ts`) considering climate/region for anything
  beyond the primary destination.
- Algolia search indexing (`functions/src/syncAlgolia.ts`) indexing anything beyond the primary
  destination's name for search purposes.
- Editing an existing trip's destination list after creation (`EditTripSheet`) — Phase 1 covers
  creation only; post-creation editing of the destination list is a natural but separate follow-up.
