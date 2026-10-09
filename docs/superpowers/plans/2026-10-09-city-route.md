# City route Implementation Plan

> Executed natively (superpowers:executing-plans), one fresh review at the end.

**Goal:** multi-city trips planned city by city — nights per city, a route editor, a city-grouped trip page, per-city Getting here / Staying.
**Architecture:** pure route math in `utils/tripRoute.ts`; one batch writer in `hooks/useTripRoute.ts`; UI in `components/trip/RouteEditorSheet.tsx`, `components/trip/CitySection.tsx`, wired into `app/trip/[id].tsx`.
**Spec:** `docs/superpowers/specs/2026-10-09-city-route-design.md`

## Global constraints
- Days remain documents; `dayNumber` contiguous 1…N, `destinationIndex` always written (older apps + existing code read it).
- `Destination.nights` optional; older apps ignore it. No new enum values anywhere.
- Light editorial UI rules (supernova-design checklist); house spring; Light/Medium haptics; ≥44pt targets.
- Single-city trips render exactly as before.

## Review focus
1. A route save that would delete days with stops never does so without the confirm.
2. Reordering keeps every stop with its city (no stop lands in another city).
3. Dates-TBD trips (no start date) — ranges by day number, no crashes on null dates.
4. Collaborators can save the route; viewers can't open the editor.
5. A trip whose days were added before this (all index 0) opens with a sensible split and saving moves no stops between days unexpectedly (days keep order).

## Task 1 — route math (`utils/tripRoute.ts`, tests `__tests__/utils/tripRoute.test.ts`)
`cityRanges`, `nightsFromDays`, `evenNights`, `routeNights`, `planRoute`, `endDateFor`, `absorbEndDateChange`, `bookingCityIndex`, `citySummary`. TDD; commit.

## Task 2 — writer (`hooks/useTripRoute.ts`, `types/index.ts`)
`Destination.nights`; `saveRoute(trip, entries)` → one `writeBatch`: trip destination order + nights + endDate; day creates/updates/deletes (with their activities). Invalidate trip queries. Commit.

## Task 3 — route editor (`components/trip/RouteEditorSheet.tsx`)
Cities with nights steppers, move up/down, remove (Delete days / Move to next city), Add a city (DestinationPicker), live dates line, Save with stop-loss confirm. Commit.

## Task 4 — trip page (`components/trip/CitySection.tsx`, `app/trip/[id].tsx`, `stores/useTripSectionsStore.ts`)
Pills always tappable on multi-city (+ All, + Edit route); All = folding city sections (first open); one city = header, Getting here, Staying, days, Add a day in city; ⋯ menu (Change nights / Move earlier / Move later / Remove). Edit trip date change absorbed by last city. Commit.

## Task 5 — docs, full suite, fresh review, fixes, merge, build
