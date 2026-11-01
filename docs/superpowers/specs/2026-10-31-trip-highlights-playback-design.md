# Trip playback highlights for long trips — design

Date: 2026-10-31 · Owner-approved in chat (both sections + photo timing) · Branch `feat/trip-highlights` (from `feat/trip-invite-links`)

## Goal

Long trips (the owner's Europe trip will have hundreds of stops) play **day by day and city by city** instead of flying to every stop: a chapter per city, one moment per day with that day's photos shown long enough to see, and how they travelled between cities (train, ferry, bus, drive, flight). Short trips keep today's stop-by-stop flyover. Applies to in-app playback and the recorded trip video.

## Owner decisions

- **Automatic:** a trip with **more than 4 days or more than 25 stops** plays as highlights; shorter trips play as today. No switch.
- **One chapter per city:** consecutive days in the same city form one chapter ("TOKYO · DAYS 1–4"); inside it, one short moment per day, so a one-city 8-day trip still has 8 moments.
- **Photos must be seen:** each day's moment shows **up to 4 photos one after another, each on screen 2 s**, after the camera arrives. A day without photos passes quickly.
- **Video stays about a minute:** photos keep their full 2 s; on long trips the video shows fewer photos per day (photo days first), never shorter ones. In-app playback has no cap and shows every day's photos.

Data checked 2026-10-31: the longest live trip is 17 days / 76 stops (Thailand, saved as one destination "Thailand"); the tester's "Japan" trip is Tokyo only, 8 days / 32 stops. Most trips store no per-day city, so cities must be derived.

## What people see

- **Chapter opening:** aerial of the city, eyebrow `TOKYO · DAYS 1–4` (`DAY 5` for a single day).
- **Arrival into a chapter** (all but the first): the line draws from the previous city with the travel icon and `Train to Osaka` / `Flight to Bangkok` / `Ferry to Naoshima` / `Bus to Hakone` / `Drive to Kyoto` / `Cruise to …`. Flights as an arc (as today), train/ferry/bus/cruise as a straight line, drives on a road route.
- **Day moment:** the camera moves to the day's area; caption `DAY 2 · SHIBUYA & HARAJUKU` (the day's area from its title, else the city); then up to 4 photos as framed prints, one after another, 2 s each. No photos: the day's stops show as dots and the moment holds 1.5 s.
- End card unchanged.

## Design

### Planner — `utils/highlights.ts` (pure, tested)

- `HIGHLIGHT_MIN_DAYS = 5`, `HIGHLIGHT_MIN_STOPS = 26`; `isLongTrip(dayCount, stopCount)` = `dayCount >= 5 || stopCount >= 26`.
- `dayCities(days, savedCities)`: per day, a city index.
  - When the trip has saved cities (multi-city route: `destinationIndex` on days / `routeNights`), use them.
  - Else cluster: walk the days in order; a day's anchor is the median of its grounded stops; it joins the nearest existing cluster within **50 km**, else starts a new one. Days with no grounded stops take the previous day's city (the first such day takes the next one's).
- `cityName(cluster, savedName)`: saved name; else the most common trailing segment of the cluster's stops' `searchQuery` (`"Senso-ji, Tokyo"` → `Tokyo`; ignores segments that are a country code or contain digits); else `null` → the player asks Mapbox reverse geocoding (types `place`) once per cluster and caches it in memory for the session (nothing persisted).
- `tripChapters(days, stops, savedCities)` → `Chapter[]`:
  - `Chapter = { cityIndex, cityName: string | null, center: LatLng, dayNumbers: number[], moments: Moment[], arrival: { travel: Travel; from: LatLng } | null }`
  - Consecutive days in one city form a chapter (Tokyo → Osaka → Tokyo is three chapters).
  - `Moment = { dayNumber, dayId, label: string, at: LatLng, stopId, photos: { url: string }[] }` — `at` is the grounded stop nearest the median of the day's grounded stops; `label` = the day title with any `Day N:`/`Day N –` prefix removed, else the city name; `photos` = up to 4 from the day's journal photos (only on trips the viewer is on — same rule as `pickFilmPhotos` today).
  - `arrival.travel` = `legTravel(lastStopOfPreviousChapter, firstStopOfThisChapter)` (bookings via `arriveBy`, transport wording, distance — already in `utils/tripRoutes.ts`), never `walk` (a sub-2.5 km city change reads as `drive`).
- `travelLabel(travel, city)`: `Train to {city}` etc.; `null` city → `Train to the next stop`.
- `highlightRouteStops(chapter)` → `RouteStop[]` for `buildPath`: `[arrival.from (as a stop carrying arriveBy = travel), ...moments.at]`. Drives between cities route on roads (one Directions call per city change, cached in the trip's route cache like any leg); moments inside a city are linked by straight lines (no per-stop road calls).

### Timing — `utils/flyover.ts`

- New constants: `HIGHLIGHT_PHOTO_MS = 2000`, `HIGHLIGHT_PHOTOS_MAX = 4`, `HIGHLIGHT_EMPTY_HOLD_MS = 1500`, `HIGHLIGHT_ARRIVE_MS = 1500` (camera settles before photos).
- `momentHoldMs(photoCount)` = `HIGHLIGHT_ARRIVE_MS + photoCount * HIGHLIGHT_PHOTO_MS`, or `HIGHLIGHT_EMPTY_HOLD_MS` with none.
- `FlyoverTiming.dwells` (exists, per stop) carries each moment's hold, so the reducer pauses there as it already does for film photos. Chapters reuse `introMs` for the opening.
- `highlightFilmTiming(chapters)`: fit ≤ `FILM_BUDGET_MS`: start from every day's moment with all its photos; while over budget, remove one photo from the day with the most photos (ties: the later day), then cut chapter openings to 2.5 s, then (only if still over with no photos left) shorten empty holds to 0.8 s. Never shortens a photo below 2 s.

### Player — `components/trip/TripMapView.tsx`

- When `isLongTrip`, the flyover's "days" are the chapters: each chapter's path from `highlightRouteStops`, its stops the moments, its eyebrow/captions from the chapter; `FilmOverlay` / playback card show the moment caption and its photos **in sequence** (print swaps every 2 s within the hold) instead of one print.
- Chapter openings use the existing `introShot`; the arrival line uses the existing per-travel line styles and vehicle; moments use `stopShot(hold)`.
- Mapbox reverse lookup for `cityName === null`: once per chapter on play, 2 s timeout; failure → label `Day N` without a city.
- Short trips: unchanged code path.

## Cost and performance

No new paid calls except at most one reverse geocode per unnamed city per session (Mapbox free tier) and one Directions call per driven city change (fewer than today's per-stop legs). Planning is O(stops); a 30-day, 200-stop trip must plan in < 100 ms (test).

## Testing (pure Jest)

`isLongTrip` thresholds; `dayCities` with saved cities, clustering by 50 km, a return to an earlier city, days without stops; `cityName` from search text; moment stop choice and label stripping; photo cap 4 and the member-only rule; `travelLabel`; `arrival.travel` never `walk`; `momentHoldMs`; `highlightFilmTiming` (fits budget, never < 2 s per photo, drops photos from the busiest day first); a 200-stop / 30-day planning performance test. Device: the owner's long trip and the tester's Tokyo trip in playback and video on iPhone and Android.

## Out of scope

A user switch between highlights and every stop; persisting city names; rail/sea route geometry (straight lines, as today).
