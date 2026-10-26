# Past trips from photos — design

Date: 2026-10-25 · Owner-approved in conversation (sections 1–4) · Travel-agent itineraries are a separate, later project.

## Goal

Let anyone turn a trip they've already taken into a Supernova trip in a minute: they pick the trip's photos, Supernova
builds the days and stops from when and where each photo was taken, puts every photo on its stop (so playback and the
trip video show them), and Nova writes the title and captions. Today it works only by adding every stop by hand and
attaching photos one stop at a time.

## Decisions (owner, 2026-10-25)

- **Main path: from photos.** Not "tell Nova", not an improved manual flow.
- **Picking: the normal photo picker**, up to 100 photos. Never full photo-library access.
- **Sharing: a normal trip** (visibility picked at the end, Followers by default) plus optional **Post to the feed** and
  **Make the video** on the finish screen. Nothing is posted automatically.
- **Free for everyone.** Nova's writing uses one message of the monthly Nova allowance (10 free / 300 Pro).
- **Approach A:** grouping on the phone, places from Mapbox, one Nova call that sees names and times only. No photos or
  photo coordinates leave the phone.
- **Photos land on their stops** as the stop's journal photos, so playback and the video pick them up with no extra
  step.

## User flow

1. **Entry.** Create tab: a third option, **Add a trip you've taken** ("Turn your photos into a trip"), beside Generate
   with AI and Plan it yourself. Also the empty state and header action of the profile's **Been there** section.
2. **Pick.** The system picker, multi-select, ≤ 100 photos. Line above: "Pick the trip's best photos. We use when and
   where they were taken to build it — locations never leave your phone." Android asks once for
   `ACCESS_MEDIA_LOCATION` ("access photo locations").
3. **Building.** "Building your trip" with the star animation and three steps: reading photos, finding places,
   writing your story.
4. **Review** (nothing is saved yet):
   - Header: cover photo, eyebrow (`MAY 3 – 7, 2025 · 5 DAYS`), editable title.
   - Per day: `Day 2 · Alfama` with Nova's editable one-line caption, then its stops: place name, time, a strip of the
     stop's photos.
   - Tap a stop: rename, change place (existing place search), merge with the stop before, delete.
   - Long-press a photo: move it to another stop.
   - **Unplaced photos** tray: photos without a location (or unreadable); drag onto a stop, or leave out.
   - A stop with more than 10 photos shows "10 of 14" and lets you swap which 10.
   - Visibility (Followers default) and the one primary action, **Save trip**.
   - Leaving: "Discard this trip?"
5. **Finish.** "Your {city} trip is saved." **Make the video** (opens the trip video sheet), **Post to the feed** (the
   normal composer with the cover photo and the trip attached), text link **View trip**.

Edge cases: no photo has a location → "These photos don't say where they were taken", offer to build the days from the
dates and let the person name the places; photos spanning > 60 days → suggest one trip at a time; offline → "Connect to
the internet to build a trip" (as other writes, `requireOnline`).

## Building the trip

All rules are pure functions in `utils/pastTrip.ts`, unit-tested.

- **Input per photo:** taken-at (EXIF `DateTimeOriginal`, the printed local time, never converted; `OffsetTimeOriginal`
  kept when present), latitude/longitude when present, the local asset uri.
- **Days:** the photo's local calendar date. The trip runs from the first photo's day to the last; days between with no
  photos stay as empty days.
- **Stops:** within a day, by time; a new stop when the next photo is > 250 m from the current stop's centre or > 90 min
  after its last photo. Position = the centre of its photos; time = its first photo's time (written as `startTime`,
  the person's own time — the "never preset" rule is about AI guesses).
- **Cities:** a stop > 50 km from the trip's current city starts a new city; nights per city follow from the days, and
  the trip is saved through the existing multi-city route rules (`utils/tripRoute.ts`).
- **Place names:** one Mapbox reverse lookup per stop for the nearest named place (≤ 100 m), else the neighbourhood
  ("Alfama"); the stop is saved placed (lat/lng, `placeName`), like a Mapbox-grounded stop.
- **Photos per stop:** up to 10 (journal cap raised from 5 to 10 everywhere — `MAX_JOURNAL_PHOTOS`, journal rules); with
  more, the 10 spread most evenly across the visit are kept by default.
- **Cover:** the first photo of the stop with the most photos, unless the person picks another.
- **Nova:** a new callable (e.g. `pastTripStory`) receives cities, stop names and times only — no photos, no
  coordinates — and returns `{ title, description, dayCaptions[] }` (title ≤ 60, captions ≤ 80, description ≤ 2
  sentences). It charges one message of the shared Nova allowance, only on success, and requires AI consent
  (`useAiConsentGate`; server checks `aiConsentVersion`). Declined consent or a failure → "Trip to {city}", empty
  captions, and saving still works.

## Saving

1. Trip, days and stops in **one batch** (all or nothing), through the same writers as manual trips. The trip carries
   `source: 'photos'`, dates (`startDate`, `endDate`, `startDay`), visibility, description, day captions as day notes.
2. Photos are re-encoded as every upload is (JPEG, ≤ 2048 px, metadata and location removed —
   `services/postMedia.ts` `webJpeg`) and uploaded to `journal_photos/{uid}/{tripId}/{activityId}/`, then written to
   each stop's `journal/entry.photoUrls`. Uploads run a few at a time with one retry each.
3. The cover photo's uploaded URL becomes `coverImageUrl`.
4. Failed uploads → the finish screen shows "3 photos didn't upload · Try again" (retry from the files still on the
   phone). If the app closes mid-upload the trip is already saved; the rest can be added from the stop as today.

## Past trips in the rest of the app

A **past trip is any trip whose end date has passed** (hand-built old trips count too). `source: 'photos'` is a label and
a usage count only.

- **Profile:** the Trips tab splits into **Upcoming** and **Been there** (newest first, a line like "12 trips · 9
  countries"; empty state: icon, "Add a trip you've taken", "Turn your photos into a trip", action).
- **Unchanged and already right:** feed trip cards, Explore and destination pages (public, ≥ 3 stops), globe heat
  (public stops), search, calendar feed (drops trips ended > 30 days ago), friends on a trip (today only), offline
  (past trips saved last).
- **Must leave past trips alone (server deployed before the app):**
  - Booking matching never links a booking to a trip that has ended.
  - Trending never counts a trip that had ended before it was created.
  - Nova's free trip check (zig-zag days, dinner before lunch, …) is skipped on past trips; Nova chat still works.

## Privacy and cost

- Photo locations are read on the phone only; never uploaded or stored. Uploaded photos carry no location. Stops keep
  only the place's own coordinates. Nova sees place names and times. App Store / Play privacy labels unchanged; the
  privacy policy mentions the Android "photo locations" permission.
- Per trip: ~10–20 Mapbox lookups, one Nova call (~$0.001), photo storage as for posts. Well under a cent.

## Testing

- **Spike first, on real phones:** does the picker hand over each photo's location without full library access? iOS
  (`expo-image-picker` with `exif: true`) and Android (with `ACCESS_MEDIA_LOCATION`). If iOS doesn't, fall back to
  limited library access to the selected photos only. Reported to the owner before the rest is built.
- **Unit tests** (`__tests__/utils/pastTrip.test.ts` and server tests): days, stops (250 m / 90 min, a trip crossing
  midnight, photos out of order), cities and nights, unplaced photos, best-10 and cover choice, the "no locations"
  fallback, Nova's answer parsing and fallback, and the three "leave past trips alone" rules.
- **Device test** with a real trip on the owner's phone, then playback and the video.

## Shipping

Needs a new app build (Android permission, new screens). Deploy the server pieces first: `pastTripStory`, booking
matching, trending, journal rule (10 photos).

## Not in this project

Travel-agent itineraries for clients; a personal "places I've been" map; recognising places from photo contents;
scanning the library by date or album.
