# Wallet ↔ trips — bookings find their trip

Status: approved in conversation 2026-10-03 · Pro only · Part 1 of the premium
wallet (Part 2, a personal forwarding address for confirmation emails, gets its
own spec and reuses this matching).

## Intent

A booking in the wallet (flight, hotel, restaurant, activity) belongs to a
trip, and today nothing connects them. With this, a booking links itself to
the right trip when that's clear, asks when it isn't, and shows up on the
trip's days with its confirmation details. The wallet stops being a separate
drawer of tickets and becomes part of the plan.

Decided in conversation:
- **Link + show on days.** Bookings never add or remove itinerary stops. A
  stop that is clearly the same place gets the booking's details instead of a
  second row.
- **Auto when sure, ask when not.** One clear trip → link and say so (Undo).
  More than one, or dates without place → ask. None → stay in the wallet.
- **Private.** Only the booking's owner sees it on a trip, shared trips
  included (seats and confirmation codes are personal).
- **Pro only.** Matching never runs for a free account. Free users see "Add to
  a trip", which opens the paywall.

## Data

`boarding_passes/{id}` and `reservations/{id}` gain (all optional, so existing
items and older apps are unaffected):

| Field | Meaning |
|---|---|
| `tripId: string \| null` | The linked trip |
| `tripLink: 'auto' \| 'manual' \| null` | How it was linked (auto links can be re-decided; manual ones never are) |
| `tripSuggestions: string[]` | Trip ids for the "Is this for a trip?" card; cleared on any choice |
| `tripLinkDismissed: boolean` | "Not for a trip" — never matched again |
| `placeCity: string`, `placeCountryCode: string` | Where the booking is (ISO 3166-1 alpha-2); for a flight, the destination |
| `originCountryCode: string` | Flights only — so a flight home from Rome still matches the Rome trip |
| `localDate: string` | `YYYY-MM-DD` as printed on the confirmation (flights: departure day). Reservations already have `checkIn`/`checkOut` |

**Parser** (`parseTravelConfirmation`): the prompt also asks for city, country
code and the local departure date, so a "Roma" address and a "Rome" trip still
match. Manual entry fills `placeCity` from the city fields people already type;
the country is left empty (place then matches on city name only).

**Rules:** owners may set `tripId`, `tripLink`, `tripSuggestions`,
`tripLinkDismissed` on their own items only while `users/{uid}.tier` is `pro`
or `business`; a free owner may only clear them. Composite indexes
`(ownerUid, tripId)` on both collections.

## Matching (server, one implementation)

Pure module `functions/src/bookingMatch.ts` (no firebase-admin, unit-tested):

- `bookingWindow(item)` → `{ start, end, places }` in calendar dates: a flight
  is its `localDate` (fallback: the ISO date's day) ±1 day for overnight
  arrivals; a reservation is `checkIn`–`checkOut` (or `checkIn` alone).
  `places` = destination city/country, plus origin for flights.
- `tripWindow(trip)` → its `startDate`–`endDate` as calendar dates, or null for
  "Dates TBD" (never auto-matched).
- `placeMatches(booking.places, trip)` → any trip destination
  (`destination` + `additionalDestinations`) with the same country code, or
  the same city name after accent/case folding and a short alias list
  (Roma/Rome, München/Munich…). Unknown place → `null` (unknown, not false).
- `matchDecision(booking, trips)` →
  - `{ kind: 'link', tripId }` — exactly one trip overlaps in dates **and**
    matches on place;
  - `{ kind: 'ask', tripIds }` — several trips qualify, or dates overlap where
    place is unknown (most recent first, at most 3);
  - `{ kind: 'none' }`.

Candidate trips: ones you own or are an accepted collaborator on.

**Callable `matchBooking({ kind, id })`** (Pro; free → `{ kind: 'none' }`):
reads the item and your trips, applies `matchDecision`, writes `tripId` +
`tripLink: 'auto'` or `tripSuggestions`, and returns the decision with the
trip titles so the app can show the banner or card immediately. Skips items
that are dismissed or manually linked. The app calls it right after an add or
import; Part 2's email pipeline will call the same function body directly.

**Trigger `onTripWrittenRematch`** (`trips/{id}`): when a trip is created or
its dates or destinations change, re-run matching for the trip's members' Pro
bookings that are unlinked and not dismissed, and for their `auto` links to
this trip (a trip moved off those dates loses the link). It never touches
`manual` links. A deleted trip clears `tripId` on every booking linked to it.

## App

**After add/import:** call `matchBooking`.
- `link` → banner sliding up from the bottom: "Added to {trip title}" ·
  **Undo** (clears the link and sets `tripLinkDismissed`). House spring; Light
  haptic.
- `ask` → the item's detail screen opens with an **"Is this for a trip?"**
  card: one row per suggested trip (eyebrow `JUL 25 – 30`, trip title) and
  "Not for a trip". One tap decides (`manual` link, or dismissed).
- `none` → nothing.

**Wallet item detail:** a Trip row under the hero —
`ROME IN SPRING · JUL 25 – 30` (opens the trip) with **Change** (trip picker
of your trips) and **Remove from trip**; unlinked → **Add to a trip** (free →
paywall).

**Wallet list:** linked cards show the trip as an eyebrow.

**Trip page** (owner of the booking only; fetched with
`where ownerUid == me && tripId == trip.id` on both collections):
- **Flight:** a Booked row on the day whose date is its `localDate`, sorted by
  departure time among the stops: airline type icon, `AA 104 · JFK → FCO ·
  08:10`, `Seat 14A · Conf. XK7P2Q`.
- **Hotel:** "Check in · {name}" on the check-in day, a slim "Staying at
  {name}" line at the top of each night in between, "Check out · {name}" on
  the check-out day.
- **Restaurant / activity / show:** a Booked row on its date.
- **Same place as a stop** (`bookingMatchesStop`: same type family, and the
  stop's `placeName`/title shares the venue's distinctive words — the same
  rule as the seed's `plausibleMatch`): no separate row; the stop gets a
  `Booked · Conf. 88213` line.
- Tap any booked row or line → the wallet detail.
- **Bookings chip** next to Budget/Packing: `Bookings · 3`, opening a list of
  everything linked, grouped by type. Only shown when you have any; it is the
  only place bookings appear on a "Dates TBD" trip.

Pure client module `utils/bookingDays.ts`: which day(s) a booking lands on,
its row label and secondary line, the hotel check-in/staying/check-out role,
and `bookingMatchesStop`.

Design rules: semantic icons from `constants/icons.ts` (`ACTIVITY_ICONS.flight`,
`RESERVATION_ICONS`), `BOOKED` eyebrow, hairline rows, no new primary action
on the trip page, Light haptic on link/unlink, Medium on Undo.

## Edge cases

- Pro lapses: existing links stay and still show (the data is yours); no new
  matching runs, and Change/Add open the paywall.
- A booking whose trip you can no longer read (removed as collaborator, trip
  deleted): the trigger clears it on delete; otherwise the Trip row shows
  "Trip unavailable" with Remove.
- Same booking on two trips: impossible — one `tripId`.
- Return flight on the last day of a trip with an overnight arrival: covered
  by the ±1 day window and origin-country matching.
- `matchBooking` failing (offline): the booking saves as today; no banner. The
  trigger picks it up the next time the trip changes, and "Add to a trip" is
  always there.

## Testing (pure, Jest)

`bookingWindow` (flight local date vs ISO fallback, ±1 day, reservation
ranges, missing dates), `tripWindow` (TBD → null), `placeMatches` (country,
city alias/accents, unknown → null, flight origin), `matchDecision` (one sure
trip → link; two → ask; dates-only → ask; TBD trips skipped; dismissed and
manual skipped by the caller), `rematchPlan` (which bookings a trip change
re-decides), `bookingDays` (flight day, hotel three roles, out-of-range dates,
TBD trip), `bookingMatchesStop` (Hotel Artemide vs "Check into Hotel
Artemide"; different hotels in one city don't match).

## Out of scope

The forwarding address (Part 2), Live Activities, sharing a booking with trip
members, creating itinerary stops from bookings, Gmail access.
