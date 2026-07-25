# AI-Generate Trip Dates

**Date:** 2026-07-24
**Status:** Approved

## Context

The AI trip generation form (`app/trip/ai-generate.tsx` + `components/trip/AiPromptForm.tsx`)
only lets a user pick a trip *length* (a 1–14 day stepper) — there is no way to attach real
calendar dates to an AI-generated trip. This is purely a missing UI gap: `GenerateTripRequest`
(both the client type in `types/ai.ts` and the Cloud Function's mirror in `functions/src/types.ts`)
already carries `startDate: string | null` / `endDate: string | null`, `app/trip/ai-generating.tsx`
already reconstructs them from route params, and the `generateTrip` Cloud Function already converts
them to real Firestore `Timestamp`s on the created trip (`generateTrip.ts:78-79`). Today
`ai-generate.tsx` simply hardcodes `startDate: '', endDate: ''` when navigating forward.

The manual trip wizard (`app/trip/new.tsx`) already has a working start/end date step (`Step2Dates`)
built on `components/ui/DatePickerModal` — this feature reuses that same component rather than
building a new date picker.

## Design Decision

| Decision | Choice | Rationale |
|---|---|---|
| Dates vs. duration relationship | Dates drive duration when both are set | No way for the itinerary's actual day count to disagree with the trip's calendar dates. Duration stepper stays fully manual when no dates are picked (matches the manual wizard's "dates are optional" philosophy). |
| Date picker component | Reuse `components/ui/DatePickerModal` | Already used identically by `app/trip/new.tsx`'s `Step2Dates` — no new picker component needed. |
| Backend changes | None | `GenerateTripRequest`, `ai-generating.tsx`, and `generateTrip.ts` already fully support real dates end-to-end; only the intake form was missing the UI. |

## Changes

### `components/trip/AiPromptForm.tsx`

Add a new "Travel dates" field between the existing Destination and Duration fields:

- Two `DatePickerModal`-backed buttons (start date, end date), visually matching
  `app/trip/new.tsx`'s `Step2Dates` date buttons (same `dateButton`/`dateText` style shape).
- Both optional — an unset date shows placeholder text ("Tap to set date", reusing the existing
  `formatDate` helper's fallback text from `new.tsx`).
- When both `startDate` and `endDate` are set: the existing duration stepper (+/- buttons) becomes
  disabled and its displayed value is derived from the date range (`diffDays(startDate, endDate) + 1`
  — inclusive day count) rather than the manually-tracked `durationDays` state.
- A small "Clear dates" text action (only shown once both dates are set) resets both to `null`,
  returning the duration stepper to fully manual control.
- The end-date `DatePickerModal` is given `minimumDate={startDate ?? undefined}`, exactly as
  `new.tsx`'s `Step2Dates` already does — structurally prevents picking an end date before the
  start date rather than needing separate validation after the fact.
- New props: `startDate: Date | null`, `endDate: Date | null`, `onStartDateChange: (d: Date | null) => void`,
  `onEndDateChange: (d: Date | null) => void`.

### `app/trip/ai-generate.tsx`

- Add `const [startDate, setStartDate] = useState<Date | null>(null)` and the equivalent for `endDate`.
- Reuse the same `diffDays` helper `new.tsx` already defines locally (duplicated here rather than
  extracted to a shared util — both call sites are small, single-file-scoped date-math helpers, and
  this codebase doesn't have a shared `utils/dates.ts` precedent to extend).
- When both dates are set, `durationDays` is derived (`diffDays(startDate, endDate) + 1`) instead of
  read from the manual stepper's state; pass that derived value through as `durationDays` in the
  `handleGenerate` navigation params, matching what the Cloud Function's day-count logic expects.
- Pass `startDate.toISOString()` / `endDate.toISOString()` (or empty string, matching the existing
  hardcoded-empty-string convention `ai-generating.tsx` already expects) as the `startDate`/`endDate`
  route params instead of the current always-empty values.

## Out of Scope

- No changes to `ai-generating.tsx` or `functions/src/generateTrip.ts` — both already handle real
  dates correctly.
- No shared date-utility extraction — the two `diffDays` implementations (this feature's and
  `new.tsx`'s existing one) stay independently duplicated, consistent with there being no existing
  shared date-math module in this codebase to extend.
