# Ask Nova, phase 2: personality, real places, sensible routes, full control, wallet

Status: approved in conversation 2026-10-16 (approach B). Builds on `2026-10-14-trip-agent-design.md`.

## Why

Testing phase 1 on the owner's Mission Beach trip (thread `trip_aaq5y9McrtfhYLs9eMni`) showed:

1. **Nova can't see geography.** Its context has stop titles only, so it can't tell La Jolla from Ocean Beach. It agreed two
   stops were close only after being told, and its reorder left Day 2 crossing town.
2. **It never places stops.** Every `addStop` came back with `after: null`, so new stops landed at the end of the day.
3. **New places are grounded blind, after acceptance.** "Drinks at Pennant Bar" was grounded later by the background pass and
   landed outside Mission Beach. Nothing showed the address before the owner accepted.
4. **It can't fix a place.** "That's not the correct address" had no operation, and was dropped ("1 suggestion didn't fit").
5. **Tone.** Stiff ("My apologies…"), asked "Where would you like to put it?" despite the prompt, and answered "What should I
   do differently?" with a menu instead of advice.

Owner's goals: friendly and helpful, a star avatar (like Muse's), recommendations in the trip's actual area, stops that flow
from one to the next ("crucial for user experience"), the ability to change any part of a trip, and wallet bookings in the
right places. Owner constraint (unchanged): **best performance for the lowest cost.** Report the measured cost per message
after testing.

## Approach (B): Nova decides *what*, code decides *where*

The model chooses intents and writes the reply. Code finds places and computes order. One model call per message, as in phase 1.
Approaches A (prompt only: unreliable spatial reasoning) and C (multi-call tool agent: 3–5× cost, 4–10 s) were rejected.

## 1. Personality and avatar

- **Voice: warm local friend.** Enthusiastic but brief; says *why* in half a sentence; uses the trip's own names ("after
  the surf lesson"); never "My apologies"; when wrong, says so plainly and fixes it; never asks where to put something; at
  most 3 sentences; no emoji, no exclamation marks (app copy rule); the person's language. Example:
  "Pennant's a great call: big deck right on the boardwalk, perfect at sunset. It's on Saturday after your surf lesson since
  you'll already be at the beach."
- **"What should I change?"** gets real advice from the context: at most 3 specific points with proposed operations.
- **Avatar** (`components/agent/NovaAvatar.tsx`): the star (`assets/images/SupernovaStar.png`) in a 28 pt round badge
  with a soft brand-gradient glow. It sits beside each Nova message and, at 36 pt, in the sheet header. While Nova is
  thinking it pulses (scale 1 → 1.08, opacity, house spring); that replaces the spinner. Reduced Motion: static.
  `accessibilityLabel="Nova"`.

## 2. Trip check on open (no AI call, free)

`utils/tripCheck.ts` (pure) runs when the Ask Nova sheet opens. It returns at most 2 findings, ranked:

| Finding | Rule | One-tap fix |
|---|---|---|
| Zig-zag day | route length ≥ 1.4 × the optimal order and ≥ 3 km longer (placed stops only, ≥ 3 of them) | "Reorder Day N": computed on the phone (§3) and shown as a normal proposal card; free |
| Far stop | a placed stop > 25 km from its day's city centre | "Find one nearby": sends a prepared message to Nova (uses a message) |
| Meals out of order | a stop titled or typed dinner before one titled lunch on the same day | "Swap them": local proposal |
| Clash with a booking | a stop with a time during a booked flight/train on that day | "Move it": sends a prepared message |

The greeting uses the first name: "Hi Mark. Day 2 crosses town three times. Want me to reorder it?" With no findings it
shows a short friendly line and the existing 3 suggested prompts. Local proposals are stored only in the sheet's state, not
in the thread, and never count against the quota.

## 3. Grounding and placement (app side)

**Grounding.** `trip.addStop` and the new place edit carry `query` (the name to search for, e.g. "Pennant, Mission Beach").
When a proposal card renders, `utils/agentGround.ts` grounds every new place through the existing
`searchPlaceInBounds(query, cityBounds, proximity)` (Mapbox, with `pickBestFeature` / `nameOnlyRetry`, bounds from
`resolveCityBounds` for that day's city). Results are cached per message in memory.
- Found inside the box → the card line shows the name + short address; apply writes `placeName`, `lat`, `lng`,
  `address`, `placeId` (Google id when present, else ''), `searchQuery`, and skips the background grounding pass.
- Not found, or the answer shares no distinctive word with the name (the app-side counterpart of the seed script's
  `plausibleMatch`, moved to a shared pure util) → the line is greyed: "Couldn't find this near {city}". It can't be
  ticked. Nova's next reply sees it was dropped (the existing "didn't fit" note).
- Grounding happens before **Apply** is enabled; a spinner line shows meanwhile (< 1 s typical).

**Placement** (`utils/routePlacement.ts`, pure, haversine distances):
- `bestInsertion(stops, newStop, anchors)`: the index with the least added distance. It never goes before a first-of-day
  hotel / check-out or after a last-of-day hotel / check-in. Meals stay in their window (lunch before dinner, dinner after
  the day's last sight). A stop with a time keeps its time slot relative to other timed stops.
- If Nova named an `after` stop, it is honoured unless that adds > 2 km over the best index; then the best index wins and
  the card says "Placed after {stop} — it's on the way".
- `optimizeDay(stops, anchors)`: the order with the shortest route. Exact for ≤ 8 movable stops (permutations); otherwise
  nearest-neighbour + 2-opt. Fixed: hotel at start/end, timed stops, booked stops (`fromBooking`), unplaced stops (keep
  their relative position). Used by `trip.optimizeDay` and the trip check.

**Nova sees distances.** The server context adds, per placed stop, the distance from the previous placed stop:
`s4 The Taco Stand [restaurant] (14 km from s3)`, marks unplaced stops `(no location)`, and adds each day's total route km.
Coordinates come from the activity docs the server already reads.

## 4. Operations

Capabilities stay app-declared. A shipped app receives only what it declared: 1.0.6 declares `trip.v1` and keeps working.
New apps declare `['trip.v1', 'trip.v2', 'wallet.v1']`.

| Op | Cap | Fields | Notes |
|---|---|---|---|
| `trip.addStop` | v1 | + `query?` | v1 apps ignore `query` and ground in the background as before |
| `trip.updateStop` | v2 | `stop`, any of `title`, `type`, `time`, `endTime`, `durationMinutes`, `notes`, `query` | `query` = re-ground the place (fixes "wrong Pennant") |
| `trip.optimizeDay` | v2 | `day` | order computed by `optimizeDay` |
| `trip.swapDays` | v2 | `day`, `with` | swaps the stops of two days (days stay documents) |
| `trip.updateTrip` | v2 | `title?`, `description?`, `visibility?` | visibility respects the private-account rule; the card reads "Make this trip Public" etc. |
| `trip.addPacking` / `trip.checkPacking` / `trip.removePacking` | v2 | `label`, `category?` / `item`, `checked` / `item` | members only (rules as today); packing items get labels `k1…` in context |
| existing v1 ops | v1 | unchanged | `addCity`, `setNights`, etc. |

Off limits: budget and expenses, deleting the trip, invites and collaborators.

Validation stays two-layer: server (`agentTripOps.ts` + new `agentWalletOps.ts`: labels exist, fields well-formed, title ≤
120, notes ≤ 1000, max 12 operations) and app (`planApply` against the fresh trip). Undo covers stop, packing and trip-detail
changes; route and wallet changes are confirmed on the card instead, as route changes are today.

## 5. Wallet (`wallet.v1`)

**Context.** Only the caller's own bookings: linked to this trip, or unlinked with dates overlapping the trip (±1 day).
Labelled `b1…` with kind, name, local date/time, linked or not, and whether a stop exists. **Never** barcodes, record
locators, attachments or notes. Confirmation codes are not sent either: Nova sees only "has code".

| Op | Fields | Applies through |
|---|---|---|
| `wallet.addReservation` | `type` (hotel / restaurant / activity / rental_car / transit + `transitMode`), `title`, `date`, `time?`, `endDate?`, `confirmationCode?`, `query?` | `useReservations.addReservation` with `tripId` + `tripLink: 'manual'` when Pro; the existing booking-stop trigger then places it. Free users: added to the wallet unlinked, and the card says linking is Pro. Stored types follow the "never a new enum" rule (`transit` → `activity` + `transitMode`) |
| `wallet.linkBooking` | `booking` | `useBookingTripLink` (Pro, as today; free → the card offers the paywall) |
| `wallet.unlinkBooking` | `booking` | `useBookingTripLink` (anyone) |
| `wallet.updateBooking` | `booking`, any of `title`, `date`, `time`, `confirmationCode` | the same update path as the detail screen; boarding passes: only `departureTime`/`gate`/`seat` |

`wallet.*` ops never touch another person's booking (`ownerUid` check on both layers). The confirmation code the person
typed in chat is already in the message, so `addReservation` may carry it. Placement around bookings: booked times are fixed
anchors (§3), and no stop is placed during a flight or train.

**Consent.** The Nova consent text gains: "and the bookings in your wallet that fall on this trip (no barcodes or booking
codes)". `AI_CONSENT_MIN.agent` 2 → 3 (server and app). Trip generation and email import keep their own minimums. Nova
is only in TestFlight, so there are no shipped users to re-ask. Privacy policy updated to match.

## 6. Prompt and model

`agentPrompt.ts` is rewritten for the voice (§1), the new ops, `query` on every new place ("the real venue name plus the
area, e.g. 'Pennant, Mission Beach'"), "prefer places near the stops before and after", "use distances, never guess
nearness", and "for a messy day, use optimizeDay rather than listing an order". Model unchanged: `gemini-2.5-flash`,
thinking 0, JSON schema. The response schema is extended.

## 7. Cost

Still one model call per message. The context grows ~15–25% (distances, packing, wallet lines). Grounding is ~1 Mapbox
Geocoding call per new place, from the phone, within the free monthly allowance. The trip check and its local fixes cost
nothing. **After testing, measure and report**: tokens in/out and $ per message over the eval set and the owner's real
thread.

## 8. Testing

- Unit tests (pure, Jest): `routePlacement` (insertion, anchors, meal windows, timed stops, > 8 stops), `tripCheck` (each
  finding, thresholds, ≤ 2 ranked), `agentGround` (inside/outside box, not found, cache), the server context distance lines,
  every new op in `agentTripOps`/`agentWalletOps` (valid, malformed, foreign booking, capability filtering), `planApply` for
  the new ops, consent minimums, the prompt rules (no labels in reply, voice examples).
- `scripts/agent-eval.mjs`: new cases including the owner's Mission Beach conversation replayed, "what should I change?",
  booking from chat, wrong-address fix. Pass bar: ≥ 90% valid proposals, 100% of change requests propose changes, 0 label
  leaks, every new place has a `query`.
- End to end in the simulator on the real Mission Beach trip before a TestFlight build.

## 9. Delivery

One spec, three stages, each shippable: **(1)** voice, avatar, grounding, placement, distances in context; **(2)** full trip
control and the trip check; **(3)** wallet + consent v3. A TestFlight build after stage 3 (or after stage 1 if the owner wants
to try it sooner).
