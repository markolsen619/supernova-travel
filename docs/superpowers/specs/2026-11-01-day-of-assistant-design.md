# Day-of assistant — design

Date: 2026-11-01 · Owner-approved in chat · Branch `feat/day-of-assistant` (from `feat/activity-bookings`, which carries Year in Travel) · Ships in **1.0.10** with Year in Travel (submit ~2026-11-25)

## Goal

Make Supernova the app you open on travel day: a check-in reminder when online check-in opens, a "leave for the airport by …" reminder timed from where you're staying, a day-of flight card on Home, and the flight as an iPhone Live Activity on the lock screen and Dynamic Island.

## Owner decisions

- Everything in 1.0.10 (reminders, Home card, Live Activities).
- **Check-in reminder: free. Leave-for-the-airport and Live Activities: Pro** (next to live flight alerts, already Pro).
- No location permission, ever. No new AviationStack calls (free plan: 100/month).

## 1. Check-in reminder (free)

- Scheduled function **`dayOfReminders`** (every 10 min, UTC): boarding passes with `status ∈ {upcoming, checked_in}` departing in **(23 h 50 m, 24 h + 10 m]** with no `dayOf.checkInSentAtMs` → `notifyUser(ownerUid, { type: 'checkin_open', passId, … })`, push **"Check in for {airline} {flightNumber} to {destinationCity}"**, body "Online check-in is usually open now." Stamp `dayOf.checkInSentAtMs`.
- Departure instant: `departureTime` (ISO, UTC) — the same field `checkFlightStatus` uses.
- Tap → the pass screen, which shows **Check in online** opening `checkInUrl(airline, flightNumber)`: a built-in table of ~50 major airlines' check-in pages by IATA code (from the flight number's two-letter prefix or the airline name), else `https://www.google.com/search?q={airline}+online+check-in`.

## 2. Leave for the airport (Pro)

- Same job. When a Pro owner's pass departs in **(5 h 50 m, 6 h + 10 m]** and has no `dayOf.leaveByMs`: compute and stamp
  - `bufferMin` = **120** when origin and destination airports are in the same country, else **180** (airport countries from the extended airport table);
  - **stay** = the located `hotel`-type stop on the pass's trip (`tripId`) on the departure day, else the night before (day matched by the trip's calendar days, `tripDays`); none → no drive;
  - `driveMin` = Mapbox Directions `driving-traffic` from the stay to the origin airport (`MAPBOX_TOKEN`, the app's public token, in `functions/.env`), 5 s timeout; failure → no drive;
  - `leaveByMs = departureMs − (bufferMin + driveMin) × 60 000`; store `dayOf: { leaveByMs, driveMin | null, bufferMin }`.
- When now ≥ `leaveByMs − 30 min` and `dayOf.leaveSentAtMs` is unset (and departure is still ahead): push **"Leave for the airport by {h:mm}"**, body "About {driveMin} min to {origin}" (or "Be at {origin} by {h:mm}" with no drive). Time shown on the **origin airport's clock** (`airportTime`). Type `leave_by`, `passId`.
- `dayOf.*` and the new stamps are bookkeeping: added to `BOOKKEEPING` (no share/stop jobs); not read by the wallet pass (`walletFieldsChanged` ignores them).

## 3. Day-of flight card on Home

- On the departure's local day (origin airport clock), the top of Home (above Today/next trip) shows a **FlightTodayCard**: `TAP 204 · LIS → OPO`, departure time and countdown, gate/terminal/seat when known, status line when live, **Check in online** (until departure), **"Leave by 2:10"** for Pro when `dayOf.leaveByMs` exists, and opens the pass. Several flights → the next one.
- Pure rule `flightToday(passes, now)` picks it.

## 4. Live Activities (Pro, iPhone, iOS 16.2+)

- Library **`expo-live-activity`** (Software Mansion; config plugin adds the widget extension) — no hand-written Swift.
- **Start:** when the app is active and a Pro user's next flight departs within **6 h** and hasn't started an activity (per pass, stored locally), start one: title `TAP 204 → Porto`, subtitle `Gate 14 · Seat 21A · Boarding 13:35` (what's known), a progress/timer to departure, the star image. Also on tapping the leave-by push (it opens the app).
- **Update:** on app foreground and whenever the pass query refreshes (gate, delay, status changes) — `updateActivity`.
- **End:** at arrival (or 3 h after departure without arrival), cancelled, or pass deleted.
- **Updates with the app closed** need an APNs auth key (Apple Developer → Keys, `.p8`) for `liveactivity` pushes. The app sends the activity's push token to `users/{uid}/liveActivities/{passId}` (owner-write, server-read); the server sends updates from `checkFlightStatus` **only when `APNS_LA_KEY` is configured** (secret), else does nothing. Owner creates the key later; until then updates happen when the app is opened.
- **Android:** an ongoing "Flight today" notification (expo-notifications, `sticky`) with the same text, updated on foreground, dismissed after departure.
- Pure content builder `liveActivityContent(pass, nowMs)` → `{ title, subtitle, endsAtMs, status }`.

## Data

- `boarding_passes/{id}.dayOf`: `{ checkInSentAtMs?, leaveByMs?, driveMin?, bufferMin?, leaveSentAtMs? }` — server-written (rules: clients may not write `dayOf`).
- `functions/src/airportInfo.ts` (generated, from mwgg/Airports): IATA → `[lat, lng, countryCode]`; `scripts/build-airport-zones.mjs` extended to also write it.
- `users/{uid}/liveActivities/{passId}`: `{ token, updatedAtMs }` (owner create/update/delete; server reads); `deleteAccount` removes it with the user doc.
- New notification types `checkin_open`, `leave_by` → `utils/notificationRoute.ts` (pass screen) and `functions/src/pushData.ts` (already generic over `passId`).

## Testing (pure Jest)

`dueReminders(passes, nowMs, tierByUid)` windows (24 h ± 10 m, 6 h ± 10 m, leave-by − 30 m), sent-once, departed/cancelled skipped, free vs Pro; `bufferMinutes(origin, destination)`; `leaveBy(...)`; `stayFor(trip, days, passDepartureDay)`; `checkInUrl` for table hits, name match and fallback; `flightToday`; `liveActivityContent` (gate/seat/boarding known and unknown, delayed, cancelled); notification routes for the new types. Device: a test pass departing in ~24 h and ~6 h on the owner's phone (iPhone Live Activity, Android ongoing notification).

## Out of scope

Server-driven Live Activity updates before the APNs key exists; push-to-start; train/bus legs; real-time airport security wait times.
