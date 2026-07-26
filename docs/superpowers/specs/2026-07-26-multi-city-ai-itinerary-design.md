# Multi-City AI Itinerary Generation — Phase 2

**Date:** 2026-07-26
**Status:** Approved

## Context

Phase 1 (`docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md`) added an ordered
`additionalDestinations: Destination[]` list to trips, letting both the manual wizard and the AI-generate
intake form collect multiple destinations. It deliberately stopped short of teaching Gemini to actually
plan across them — the Cloud Function stores the list, but `buildPrompt()` in
`functions/src/generateTrip.ts` still only ever references the single primary destination, so an
AI-generated multi-destination trip's itinerary today only covers the first city.

This is Phase 2: making the generated itinerary genuinely span every destination in the list, in order,
with a coherent day allocation and explicit inter-city transitions — while guaranteeing the existing
single-destination flow (still the overwhelming majority of AI-generated trips) is completely unaffected.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Day allocation across cities | Gemini decides holistically in one prompt, given the full ordered city list and total duration | Matches the trust model the existing prompt already uses for pacing/style — no new splitting heuristic to invent, tune, or maintain in our own code |
| Inter-city transitions | Required explicit `transport`-type activity on each city's first day (e.g. "Travel from Paris to Rome"), before that city's other activities | Makes the multi-city structure visible in the itinerary itself; reuses the existing `transport` `ActivityType`, no new type needed |
| Must-see place → city association | Kept as one flat list; Gemini infers which city each belongs to from its own geographic knowledge | No UI change needed; ambiguous cases are rare and Gemini already has enough world knowledge to place "Eiffel Tower" correctly without explicit tagging |
| Per-day city labeling | None — no new field on `TripDay`/`GeneratedDay` | The required transit activity plus Gemini-authored day titles are enough signal; avoids a data-model change and a `DayTimeline` UI change for marginal benefit |
| Currency | Each city's activities use that city's own local currency | `TripActivity.currency` is already per-activity, not trip-wide, so this needs zero data-model change — just a prompt instruction, and it matches reality (a Paris activity should cost in EUR even on a London-inclusive trip) |
| Single-destination regression risk | `buildPrompt()` branches: zero additional destinations → byte-identical prompt to today; 1+ → the new multi-city prompt path | The single-destination flow is still the overwhelming majority of usage — this is the single most important guarantee in this spec, and it's structural (a literal code branch), not just an intention |
| Client-side scope | Only `app/trip/ai-generating.tsx`'s loading-screen destination text changes (comma-joined list instead of just the primary) | Everything else (trip detail display, the day timeline, the trip map) already works correctly once the itinerary itself is right — no other screen needs to know this is a "multi-city" trip specifically |

## Prompt Changes (`functions/src/generateTrip.ts`)

`buildPrompt(data: GenerateTripRequest): string` gains a fork near its start:

```
if (data.additionalDestinations.length === 0) {
  // existing single-destination prompt, completely unchanged
} else {
  // new multi-city prompt
}
```

The multi-city branch:
- Enumerates all destinations in order (primary first, then `additionalDestinations` in array order),
  each with its country code where known (`countryCode || null`, same graceful-degradation the primary
  destination already uses today).
- States the total `durationDays` and instructs Gemini to allocate it across the listed cities itself,
  in the order given, considering how much there typically is to do in each — no day-range hints
  computed by our own code.
- Adds a rule: the first day of every city after the first must include one `transport`-type activity
  (title like "Travel from {previous city} to {this city}") before any other activity that day. Its
  `searchQuery` (the existing schema's one place-identifying field) must name a real, findable transit
  hub in the departure city — its main train station or airport (e.g. "Gare de Lyon, Paris") — not the
  destination city and not a placeholder string, so the client's existing lazy Places-grounding still
  resolves a real map pin for the activity card, consistent with how every other activity's
  `searchQuery` already works.
- Adds a rule: each activity's `currency` field must reflect that specific city's local currency, not
  a single trip-wide currency.
- Keeps the existing must-see, pace, and travel-style rules exactly as they are today, applied across
  the whole multi-city itinerary rather than a single city.
- Keeps `dayNumber` as one continuous 1..N sequence spanning every city — no city-boundary reset.

The JSON output schema Gemini must return (`GeneratedTrip`/`GeneratedDay`/`GeneratedActivity` in
`functions/src/types.ts`) does **not** change — no new fields, no schema version bump. The multi-city
behavior lives entirely in the prompt instructions, not the response shape.

## Client Changes

### `app/trip/ai-generating.tsx`

The loading screen's destination text (currently `params.destination || 'your destination'`) becomes a
comma-joined list of all destinations when more than one exists — reusing the same "A, B & C" join
formatting the trip-naming auto-title feature already established in `app/trip/new.tsx`. Falls back to
just the primary destination (unchanged today's behavior) when there are no additional destinations.

No other client file changes. Trip detail display, the day timeline, and the trip map already render
whatever days/activities exist correctly regardless of which city they logically belong to — none of
them need to know this trip spans multiple cities to render it right.

## Out of Scope

- Any change to the `GeneratedActivity`/`GeneratedDay`/`GeneratedTrip` response schema.
- Any change to `TripDay`, `TripActivity`, or any other client-side type.
- Any change to `DayTimeline`, the trip map, `TripCard`, cover-photo resolution, packing templates, or
  Algolia sync — all continue to work exactly as they do today, unaware this is a multi-city trip.
- Per-city must-see tagging in the intake form.
- Any explicit UI indication of which day belongs to which city beyond the transit activity and
  Gemini-authored day titles.
- Multi-destination support for the manual (non-AI) itinerary — that trip type has no "generate the
  itinerary for me" step to begin with, so there's nothing analogous to extend.
