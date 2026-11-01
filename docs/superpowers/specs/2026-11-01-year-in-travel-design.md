# Year in Travel — design

Date: 2026-11-01 · Owner-approved in chat (both sections) · Branch `feat/year-in-travel` (from main)

## Goal

A shareable "Your 2026 in travel" story — full-screen tap-through slides like Spotify Wrapped — so travelers relive their year and share it in December, pulling new people to Supernova. Free for everyone. Must be in the stores by early December (submit ~2026-11-25).

## Owner decisions

- **Story slides** (not a video, not a printed book — the printed book is off the roadmap).
- Eligible: anyone with ≥ 1 trip that took place in 2026 — own, joined, and past trips from photos. Free.
- Home card **Dec 1 – Jan 15**; Profile row always once eligible. No trips this year → a gentle "Your year in travel starts with one trip" card with Plan a trip.

## What people see

Full-screen, always-dark (splash palette, star gradient), tap right/left to move, hold to pause, swipe down to close; progress bars along the top; ~6 s per slide.

1. **Opener** — "{First name}'s 2026 in travel", star animation.
2. **Big numbers** — trips · days away · cities · countries, counting up.
3. **Where you went** — dot-matrix world map, the year's cities glowing in the star gradient with arcs between consecutive cities; "You covered 18,400 km — about 46% of the way around the Earth."
4. **Longest trip & biggest day** — the longest trip (days) and the day with most stops, each with a photo when one exists.
5. **What you were into** — "You saved 23 restaurants and 31 sights" (by stop type) and "You travel like a Foodie" (top travel style).
6. **Best moments** — up to 6 photos the person took, as a collage. Shown only with ≥ 1 photo.
7. **Who you traveled with** — faces of people on their trips. Shown only when there are any. Never on a share image.
8. **Coming up in 2027** — the next planned trip with a countdown, else "Where to next?" + Plan a trip.
9. **Share card** — name, big numbers, map; Share and Save to Photos; "Made with Supernova · supernovatravel.xyz".

Any slide except 7 can be shared as a 1080 × 1920 image through the share sheet; every image carries the star and **supernovatravel.xyz**, rendered off-screen without app controls.

## Data — server

Callable **`yearInTravel({ year })`** (signed in; `year` 2020–2100):

- Reads the caller's trips for the year: `trips` where `authorUid == uid` and where `collaborators array-contains uid`, keeping those whose dates overlap the year (start ≤ Dec 31 and end ≥ Jan 1; undated trips excluded). With each trip: days and activities.
- Returns `YearSummary` (below) and caches it at `users/{uid}/private/yearInTravel_{year}` (owner-read via the existing `private` rule; server-written). Recomputed when the cache is older than 24 h or any counted trip's `updatedAt` is newer than the cache.
- Pure rules in **`functions/src/yearInTravel.ts`** (no firebase-admin, unit-tested):
  - `tripDaysInYear(start, end, year)` — inclusive calendar days clipped to the year.
  - `yearSummary(input)` → `YearSummary`:
    - `trips` (count), `daysAway` (sum of clipped days; overlapping trips counted once per calendar day), `cities` (distinct destination names across `destination` + `additionalDestinations`, case-folded), `countries` (distinct `countryCode`s), `km` (sum of haversine distances between consecutive located stops within each trip, in day then `order` order; rounded), `longestTrip` `{ tripId, title, days }`, `biggestDay` `{ tripId, title, dayNumber, stops }`, `typeCounts` `{ restaurant, activity, hotel, flight, transport, free }`, `topStyle` (most frequent `travelStyles` entry across trips, else from type counts: restaurants → foodie, activities → adventure; null when none), `places` (`[{ name, lat, lng }]` — each trip's cities in route order, for the map), `photos` (≤ 6 URLs: only from journal entries on trips the caller authored and the caller's own `placeReviews` photos; spread across trips, newest first), `companions` (≤ 8 `{ uid, name, avatarUrl }` — other members of counted trips, blocked users excluded), `nextTrip` (`{ tripId, title, startDate }` of the earliest trip starting after today, any year), `computedAt`.
  - `earthFraction(km)` = km / 40 075.
- Cost: one call per open (cached); reads ~ trips + days + activities of the year once a day at most.

## The map

- `assets/yearInTravel/worldDots.json`: land dots on a 2.5° equirectangular grid (~2 000 points), generated once by `scripts/build-world-dots.mjs` from Natural Earth 110 m land (public domain), committed.
- Drawn with `react-native-svg`: dots in a muted tone, the year's places as glowing gradient dots, quadratic arcs between consecutive places. Pure projection/arc helpers in `utils/yearMap.ts` (tested), antimeridian-safe (an arc crossing ±180° takes the short way).

## App

- Route **`app/year/[year].tsx`** (full-screen modal, `gestureEnabled: false`, always dark — add to CLAUDE.md's always-dark list). Fetches via `hooks/useYearInTravel(year)` (TanStack, `staleTime` 1 h).
- Slides in `components/yearInTravel/` (`YearStory` host + one component per slide + `ShareFrame`).
- Pure helpers in **`utils/yearInTravel.ts`** (tested): `visibleSlides(summary)`, `storyStep(state, action)` (6 s timer, tap next/prev, hold pause), `showYearCard(now)` (Dec 1 ≤ now ≤ Jan 15 → the year being celebrated: Dec → this year, Jan 1–15 → last year), `kmLine(km)`, `styleLine(style)`, `typeLine(counts)`, `countLabel(n, one, many)`.
- Sharing: `react-native-view-shot` (new native dependency) captures an off-screen `ShareFrame` at 1080 × 1920 → `expo-sharing`; "Save" uses `expo-media-library` only if already installed, else the share sheet's own Save Image (no new permission).
- Entry points: Home card above the Today/next-trip card in the window; Profile row "Your 2026 in travel" when eligible (a summary exists with trips ≥ 1). Not eligible in the window → the "starts with one trip" card on Home.
- Motion: counters ease up, the map's arcs draw in, house spring for transitions; respect Reduce Motion (no count-up, no arc animation).

## Privacy

Only the caller's data. Companions appear only on the caller's screen, never on a share image. Photos only those the caller took. The cache doc is owner-read, server-written. `deleteAccount` already removes `users/{uid}/private/*` with the user doc (verify in implementation).

## Testing

Pure Jest: `tripDaysInYear` across year boundaries and leap day; `yearSummary` with own + joined + photo trips, a trip without located stops, duplicate cities/countries, overlapping trips' days counted once, photos only from the caller, companions excluding blocked; `earthFraction`; map projection and antimeridian arcs; `visibleSlides`; `storyStep`; `showYearCard` around Dec 1, Dec 31, Jan 15, Jan 16; copy helpers for 0/1/many. Device: owner's and tester's accounts on iPhone and Android; share to Instagram Stories.

## Out of scope

Video export of the year, a printed book, other people's years, past years' archives beyond calling with another `year`.
