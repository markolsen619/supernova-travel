# Cities as chapters — a multi-city trip planned city by city

Status: design approved in conversation 2026-10-09 · ships in **1.0.4** (the next
App Store submission) · Part 1 only (Part 2: city cover photos, drag-reorder on
the trip page itself).

## Intent

A long multi-city trip (Central Europe: Prague → Budapest → Vienna → Salzburg →
Munich → Cologne → Amsterdam) is planned months ahead and fills up with stops
and bookings. Each city must be easy to work with and to change on its own,
instead of one long list of days.

Decided in conversation:
- Each city has a **length in nights**; its dates follow from the trip's start
  and the cities before it.
- **Changing a city's nights changes the trip's end date** (not a warning).
- Days and stops move with their city when cities are reordered, added,
  lengthened or shortened.

## Model

- `Destination.nights?: number | null` on `trip.destination` and each of
  `trip.additionalDestinations` (route order = `[destination, ...additional]`).
  Older apps ignore the field.
- **Calendar.** City *i* arrives on `start + Σ nights[<i]` and leaves
  `nights[i]` later. Day *k* (dayNumber) is the date `start + k − 1`. A day
  belongs to the city whose `[arrive, leave)` contains it; the trip's final
  day (departure) belongs to the last city. So a trip of N total nights has
  N + 1 days, and city *i* holds `nights[i]` days (the last city
  `nights + 1`). A Dates-TBD trip uses the same arithmetic on day numbers,
  without dates.
- **Days stay real documents.** Whenever the route changes, every day's
  `dayNumber` and `destinationIndex` are rewritten to match, so all existing
  code (`resolveDayDestinationIndices`, grounding, flyover, older apps) keeps
  working unchanged.
- **End date** = start + total nights, written with the route.
- **Trips without nights** (all existing trips): nights are derived from their
  days per city (`nightsFromDays`); a trip with no days gets an even split of
  its date range (remainder to the earlier cities), shown pre-filled in the
  route editor until saved.

## Changing the route (one batch write)

`planRoute(currentDays, oldRoute, newRoute)` → day creates / deletes / updates:
- Each city keeps its own days in their order (matched by the city's identity,
  not its index — reordering moves days with their city).
- **Longer:** empty days appended to the end of that city's block.
- **Shorter:** days removed from the end of that city's block; empty ones
  silently, days with stops only after a confirm naming them ("Day 3 in
  Prague has 4 stops").
- **Removed city:** confirm — *Delete its N days*, or *Move them to {next
  city}* (its days join the next city, whose nights grow by that many).
- **Added city:** appended with 1 night (adjustable) and its empty days.
- Then all days are renumbered 1…N in route order with their new
  `destinationIndex`, and the trip doc gets the new destination order,
  nights, and end date — one Firestore batch.
- Editing trip **dates** in Edit trip on a trip with nights: the start moves
  everything; a changed end date is absorbed by the last city's nights
  (minimum 1).

## Trip page (multi-city trips only; single-city trips unchanged)

- **City pills are always tappable** on a multi-city trip (the earlier
  "only cities holding some days" rule goes away — every city has its days
  now) plus **All**.
- **All:** the itinerary grouped into **city sections** that fold like Wallet
  By trip. Section header: eyebrow `NOV 18 – 21 · 3 NIGHTS`, city name, folded
  summary `3 days · 12 stops · hotel booked`, and a ⋯ menu. The first city
  starts open, the rest folded; choices remembered per device.
- **One city:** that city's header, then
  - **Getting here** — wallet bookings arriving in this city (flights by
    destination city, trains/buses/ferries by their "to" city), or "Add how
    you're getting here" (opens Add reservation / boarding pass);
  - **Staying** — hotels / Airbnbs in this city, or "Find a place to stay"
    (the existing Booking.com hand-off for that city and its nights) and
    "Add a booking";
  - its **days** with stops (existing DayTimeline);
  - **Add a day in {city}** (= that city's nights + 1, via the route write).
- **⋯ menu** on a city: Change nights · Move earlier · Move later · Remove
  city. **Edit route** (a text button above the pills) opens the route editor.
- **Route editor sheet:** the cities in order, each with nights − / +
  steppers, move up / down, remove; **Add a city** (existing destination
  picker); a live line `Nov 18 – Dec 5 · 17 nights`; one primary **Save**.
- Bookings are placed under a city by their city name (folded, accent- and
  case-insensitive, contains either way), else by their date within the
  city's dates; unmatched ones stay in the trip's Bookings sheet.

## Access

Owner and collaborators can change the route (same rules as days today).
Viewers see the grouped page read-only (no ⋯, no Edit route, no add).

## Testing (pure, Jest)

`utils/tripRoute.ts`: `cityRanges`, `nightsFromDays`, `evenNights`,
`planRoute` (longer, shorter with and without stops, reorder keeps days with
their city, remove-delete, remove-move, add, renumbering contiguous),
`endDateFor`, `absorbEndDateChange`, `bookingCityIndex`, `citySummary`.

## Out of scope (Part 2)

City cover photos; drag-to-reorder on the trip page; per-city budgets.
