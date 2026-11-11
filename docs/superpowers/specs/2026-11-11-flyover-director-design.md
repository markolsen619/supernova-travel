# Trip flyover director — design

**Date:** 2026-11-11 · **Owner approved:** approach A and sections 1–2 in chat (2026-11-11) · **Replaces the camera parts of:** `2026-10-24-trip-video-design.md`, `2026-10-31-trip-highlights-playback-design.md` (timing and naming rules stay unless changed here)

## Why

The owner tested on device (2026-11-11). They called the flyover "a key feature of our app that needs to be perfect", and named three problems:

- **Jerky, snapping camera.** The follow camera sends a new `linearTo` every second (`followStepMs`), with a new heading (`limitTurn`) and zoom (`legZoom`) each time, so it kinks every second. Arrivals (`flyTo` 1.2 s), circles (`easeTo`) and following (`linearTo`) are three different move types, and each switch shows a seam.
- **Rushed.** Fixed short durations on long legs.
- **Long trips feel disjointed.** Highlights mode jumps between moments that are far apart.

It also looks different by trip length, because short trips and long trips (`isLongTrip`: 5+ days or 26+ stops) follow different rules. And in highlights mode the card's title is always the chapter's city (`TripMapView.tsx` ~l.1823), so a one-city trip reads "Mexico City" on every moment.

## Goals

1. **Smooth.** It should feel like flying above, watching the trip come alive. There are no seams between moves, the heading changes gradually, and the camera never snaps.
2. **The same film for every trip length.** Calm and cinematic: fewer, longer shots that never rush.
3. **The card names the place on screen.** That's the stop's own name. The city and day go in the eyebrow.
4. **No new cost.** Mapbox mobile bills per monthly active user, not per tile or camera move. The route legs come from the existing cache. There is no server work.

## 1. What the traveler sees

Every trip plays day by day.

1. **Establish (3 s).**
   - The whole day's stops are framed from higher up at a 40° pitch, with the bearing facing the route's direction.
   - Eyebrow: `DAY 3 · ANCIENT PYRAMIDS & CULINARY…` (the day title without "Day N:", else the city).
   - Title: the day's first stop name.
2. **Glide.**
   - The route line draws along the day's path while the camera follows above and slightly behind it, at a steady speed.
   - Each stop passed **pulses** gently (marker scale 1 → 1.15 → 1 over 600 ms) without stopping.
   - The card title changes to that stop's name (`placeName || title`).
3. **Feature (4 s).**
   - At a key place the glide slows in, then the camera moves closer (zoom 15.5, pitch 60), drifts around it (bearing +40° with ease-in-out) and pulls back into the next glide.
   - Photos at the stop show as they do today, and the hold stretches 2 s per photo, up to 4 photos.
   - **Which stops are features:**
     - Short trips: every stop.
     - Long trips: up to 3 a day, picked by photos first, then sights (`type === 'activity'`), then the most central (`momentStop` logic).
4. **Transfer.**
   - Between days or cities more than 25 km apart, a single Mapbox `flyTo` arcs up, travels and descends, over 3–5 s scaled by distance.
   - The card reads `By train to Osaka` (existing `travelLabel` / `legTravel`).

### Pacing

- The same rules apply to every length. A day comes out at about 8–15 s, so a two-week trip takes 2–3 minutes.
- The existing day pills and progress let viewers jump ahead.

### The video

The video uses the same shots, squeezed to fit `FILM_BUDGET_MS` (about 1 minute), in this order:

1. fewer features (photos kept first);
2. 2 s establishing shots;
3. glides as fast as the speed cap allows.

Camera moves are never faster than in playback. The opening and end cards are unchanged.

### Unchanged

- the controls (play/pause, close, the day pills, video, basemap, palette);
- planned/actual views;
- satellite;
- route colours.

## 2. How it's built

### The planner, `utils/flyoverDirector.ts` (pure, no React or Mapbox)

```ts
type DirectorStop = { id: string; name: string; type: string; lat: number; lng: number; hasPhotos: boolean; photoCount: number };
type DirectorDay = { dayId: string; dayNumber: number; label: string | null; city: string | null;
  stops: DirectorStop[]; path: [number, number][]; stopFractions: number[]; meters: number };
type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };
type Shot = {
  kind: 'establish' | 'glide' | 'feature' | 'transfer';
  dayIndex: number; startMs: number; durationMs: number;
  camera: Camera;                       // where this shot ends
  move: 'easeTo' | 'linearTo' | 'flyTo';
  draw: { from: number; to: number };   // route fraction drawn across this shot (day path)
  card: { eyebrow: string; title: string };
  stopId: string | null;                // the stop featured or pulsed at the end
};
function directFlyover(days: DirectorDay[], o: { long: boolean; film: boolean; budgetMs?: number }): { shots: Shot[]; dayStartMs: number[]; totalMs: number };
function shotAt(shots: Shot[], tMs: number): { index: number; local: number };   // local = 0..1 within the shot
```

### Glides, within what Mapbox can do

Mapbox has no curved camera path in one command, so the planner does three things:

1. **Smooths** the route into a camera line. This is a moving average over about 600 m in walking areas, or about 2 km when driving, so the camera floats above the street pattern.
2. **Samples** that line into **2–4 s segments at one speed**, sent as `linearTo`. The heading eases across the glide and turns at most 12° a second. The zoom only changes from one segment to the next by at most 0.15.
3. **Slows into features** by lengthening the last 2 segments (×1.4, ×1.8), which mimics an ease-in.

### Speed

- The glide speed is capped by **screen speed**: about 35% of the screen width per second at the shot's zoom. Long, straight legs therefore look calm, not fast.
- A segment can't be shorter than 2 s.

### No seams

- Each shot's starting camera is the previous shot's `camera`, so a feature starts exactly where its approach glide ended.
- Tests assert continuity: the next shot's first command starts from the prior end-state, within a small epsilon, for center, zoom, pitch and bearing.

### Running it: `TripMapView`

- It uses `directFlyover` (memoised on the days, the route cache and `film`) in place of the follow/arrive/circle camera effects.
- One clock, the existing reducer's `t` plus play/pause/jump, drives `shotAt`.
- On a shot change it sends that shot's camera command(s): one command for establish, feature and transfer; glides send their segments in sequence.
- The route draw fraction and the card come from the current shot and `local`.
- Jump-to-day seeks to `dayStartMs`.
- The reducer keeps play/pause/tick/jump. Day durations come from the director (`dayStartMs`). `followStepMs`, `limitTurn` follow and `arrivalCamera` circling are no longer used by playback. Whatever becomes unused is removed or kept only where tests still cover other callers.

### Highlights

- `isLongTrip` stops choosing a different player; it only sets `long` (the feature cap of 3 a day).
- `tripChapters` keeps working out chapters, so transfers still say "By train to Osaka".
- The chapter's city goes into the **eyebrow**, never the title.

## Testing

Pure tests on `flyoverDirector.ts`:

- **Continuity:** for every shot change, center, zoom, pitch and bearing match the previous end-state within ε.
- **Timeline:** `startMs` is non-decreasing; durations add up to `totalMs`; `dayStartMs` matches the first shot of each day; `shotAt` finds the right shot and `local`.
- **Comfort:**
  - no glide segment is shorter than 2 s;
  - the heading turns no more than 12° a second within glides;
  - the zoom steps by at most 0.15 per segment;
  - screen speed stays within the cap;
  - each day lasts 8–15 s, outside photo holds and transfers.
- **Features:** short trips get every stop; long trips get at most 3 a day, photos first, then sights, then central.
- **Cards:**
  - glide and feature titles are the stop's `name`;
  - the eyebrow is `DAY n · label`, else the city;
  - transfers read `By {travel} to {city}`;
  - the city is never the title while a stop is shown.
- **Transfers:** only for jumps over 25 km, lasting 3–5 s by distance.
- **Film:** `totalMs ≤ budget`; features drop before glides speed up; the camera speed is never above the playback cap.
- **Edge cases:** a day with one stop; a day with no located stops (establish only, a city-level camera); unplaced stops skipped; a trip with no route cache yet (straight lines); the antimeridian (existing arc helpers).

Smoothness itself is judged on a device in a TestFlight/internal build.

## Out of scope

- frame-by-frame camera control;
- new map styles;
- music;
- changing the end card;
- server work.
