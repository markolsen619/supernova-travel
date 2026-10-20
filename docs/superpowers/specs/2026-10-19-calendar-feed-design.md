# Calendar export (subscribed calendar feed) — design

Date: 2026-10-19 · Status: approved in conversation, awaiting spec review · First of three roadmap pieces (then Apple Wallet, then Google Wallet — separate specs)

## Why

Travellers expect their trip in their calendar (TripIt's best-known feature). Supernova has the data — trips, days, stops, boarding passes, reservations — but nothing leaves the app.

## Decisions (owner, 2026-10-19)

- **Approach A — a subscribed calendar:** one private link per user; the phone's calendar subscribes once and stays current. (Rejected: writing events into the phone calendar — permission prompt, one device, fragile re-sync; a one-time .ics file — never updates.)
- **Free for everyone.**
- **Contents:** flights (timed), reservations (timed or all-day), the trip (one all-day event), each day (one all-day event listing its stops), and a timed event for any stop with a time the user set.
- **No duplicates with other sources** (Gmail/Siri/airline apps already add some bookings): per-type switches in the calendar sheet — Flights, Hotels & stays, Restaurants & activities, Trains/buses/ferries, Trip days — all on by default, with a line explaining when to turn one off; plus a "Show in calendar" switch on each booking.
- Only the user's **own** bookings (members' shared bookings are left out); own and joined trips; from 30 days ago onward.

## 1. The private link

- `createCalendarFeed` (callable): makes a token (24 × `a-z0-9`), writes `calendarFeeds/{token} = { uid, createdAt }` (server-only collection) and `users/{uid}/private/calendar = { token, types, createdAt }`. Idempotent — returns the existing token.
- `rotateCalendarFeed`: deletes the old `calendarFeeds/{token}` first, then makes a new one. `disableCalendarFeed`: deletes both docs. `setCalendarTypes({ types })`: updates `types` on the private doc. All require sign-in; none are Pro-gated.
- **Feed URL:** `https://supernova-a2125.web.app/cal/{token}.ics` (Hosting rewrite `/cal/**` → `calendarFeed`); subscribe links use `webcal://` for Apple and `https://calendar.google.com/calendar/render?cid=webcal://…` for Google.
- `calendarFeed` (onRequest, GET): looks up the token (unknown → 404, no detail), loads the user's own + joined trips (with days and activities), boarding passes and reservations, builds the iCalendar text, responds `text/calendar; charset=utf-8` with `Cache-Control: private, max-age=900`. Nothing is precomputed.
- `deleteAccount` removes the user's `calendarFeeds/{token}` and the private doc.

## 2. What's in the feed

Pure builder `functions/src/calendarFeed.ts` → `buildCalendar(input, now) : string` (RFC 5545, CRLF line endings, lines folded at 75 octets, text escaped `\\ ; , \n`).

| Source | Type switch | Event |
|---|---|---|
| Boarding pass | Flights | `DTSTART`/`DTEND` in UTC from `departureTime`/`arrivalTime` (ISO with offset); no arrival → 2 h. Summary `BA 117 · LHR → JFK`; description seat, gate, terminal, boarding group |
| Reservation `hotel`/`airbnb`/`rental_car` | Hotels & stays | All-day `DTSTART;VALUE=DATE` check-in → `DTEND` check-out (exclusive); summary `Hotel: {title}` |
| Reservation `restaurant`/`activity` (no `transitMode`) | Restaurants & activities | `time` set → **floating** local `DTSTART` (no TZID: shows at the printed clock time where the phone is) for 2 h; else all-day |
| Reservation with `transitMode` | Trains/buses/ferries | `departureLocalTime` floating, else all-day |
| Trip | Trip days | All-day span start → end (exclusive end + 1 day); summary `{title}`, description `{n} days · {region}` |
| Trip day | Trip days | All-day on the day's date; summary `Day 2 · {city}`; description the stops in order, one per line |
| Stop with `startTime` set by the user | Trip days | Floating timed event on that day, `endTime` or +1 h |

- **Stable UIDs:** `{kind}-{id}@supernovatravel.app` (`flight-…`, `res-…`, `trip-…`, `day-…`, `stop-…`), so edits update in place and removals disappear on the next refresh.
- **Never included:** confirmation codes, booking references, barcodes, addresses of bookings, notes, attachments, other members' bookings.
- **Filtered out:** bookings with `showInCalendar === false`; types switched off; everything ending before `now − 30 days`; trips with no dates (no day dates) contribute nothing.
- **Days:** day N's date = trip first day + (N − 1) (`startDay` if trustworthy, else `startDate` at noon UTC — same rule as `functions/src/friendsTraveling.ts` / `bookingStops.ts`, reused, not re-derived).

## 3. In the app

- **Settings → Calendar** row and **trip ⋯ menu → Add to calendar** open `CalendarSheet` (RN `Modal` page sheet):
  - Off: title "Your trips in your calendar", one line of explanation, primary "Turn on" (calls `createCalendarFeed`).
  - On: "Add to Apple Calendar" (iOS; `Linking.openURL(webcal…)`), "Add to Google Calendar" (opens the Google URL), "Copy link" (`expo-clipboard`), then the five type switches with the line "Gmail or your airline may already add flights and hotels to your calendar. Turn them off here so nothing shows twice.", then text links "New link" (confirm: the old link stops working) and "Turn off".
- **Booking detail screens** (boarding pass, reservation): a "Show in calendar" switch (writes `showInCalendar` on the owner's doc; existing rules allow it). Offline: `requireOnline()`.
- New: `hooks/useCalendarFeed.ts` (reads `users/{uid}/private/calendar` with `getDoc`; callables), `services/calendar.ts` (callables + URL builders), `utils/calendarLinks.ts` (pure URL builders).
- No new native module; ships whenever the next build goes out (server pieces deploy independently).

## 4. Privacy

- The link shows trips and booking times (never codes) to anyone holding it — the same model as the phone's own shared-calendar links; reset and turn-off are one tap.
- Privacy policy: one sentence — "If you turn on the calendar link, your trips and booking times are available at a private address you can add to a calendar app; you can reset or turn it off at any time." No new data type for App Privacy / Data safety (trip and booking data already declared).

## Testing

- Pure: `buildCalendar` (each event kind, UTC vs floating vs all-day, exclusive DTEND, escaping, folding at 75 octets, stable UIDs, type switches, `showInCalendar`, 30-day window, no codes/barcodes in output, a trip without dates), `calendarLinks` (webcal and Google URLs), token generation shape.
- Device: turn on → Add to Apple Calendar → events appear; edit a booking time → after refresh it moves; turn Flights off → flights vanish; reset link → old subscription stops updating.

## Out of scope

Reading the user's calendar to detect duplicates; writing events directly; Wallet passes (next specs).
