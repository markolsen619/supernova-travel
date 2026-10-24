# Share a trip as a video — design

Date: 2026-10-24 · Status: approved in conversation · Roadmap item 4 (`competitive-roadmap` memory)

## Why

The trip flyover is Supernova's most distinctive moment and it can't leave the app. A one-tap vertical video for Reels/TikTok/Stories turns every trip into free marketing.

## Decisions (owner, 2026-10-24)

- **Whole trip, ~20–30 s**, vertical; captions; Supernova end card.
- **Free for everyone**, Supernova mark always on (every video is marketing).
- **iPhone first.** Android follows as its own step (frame capture, no per-recording prompt, no Play foreground-service declaration); until then no button on Android.
- Recorded **on the phone** (no server render: cost, and Mapbox's terms for server-rendered maps).

## 1. Entry

- Trip map (`components/trip/TripMapView`): a **"Share video"** button beside the flyover's play button, iOS only, shown when `canFly` and the trip has ≥ 2 placed stops, and the native recorder is available (`ScreenRecorder.isAvailable()`).
- Tap → a small sheet: eyebrow `TRIP VIDEO`, title (trip title), body "About 25 seconds of your trip from above, ready for Reels, TikTok or Stories.", primary **"Record video"**, text link **"Not now"**. Never records without that tap.

## 2. Film mode (what's recorded)

- The map in a **clean state**: every control, sheet, the flyover card and the status bar hidden; daytime light; the person's current basemap.
- **Film timing** (pure `filmTiming(durations, stopCounts)` in `utils/flyover.ts`): opening title 1.5 s, end card 2 s, and the flyover itself fitted into **≤ 26 s**: day intro 1.2 s, stop dwell 0.6 s, each day's drawing time scaled from its normal duration (min 1.2 s for a day with a route); when intros + dwells alone exceed half the budget, dwells drop to 0 and intros to 0.6 s; then drawing times are scaled down to fit. Days with no route and no stops are skipped as today. The reducer takes the timing (`introMs`, `dwellMs`) on `play`/`jump`/`tick` (defaults = today's `DAY_INTRO_MS`/`STOP_DWELL_MS`, so the normal flyover is unchanged).
- **Captions** (pure, `utils/tripVideo.ts`): opening `JUL 25 – 30 · 6 DAYS` over the trip title (dates TBD → `6 DAYS`); per day `DAY 2 · LISBON` (the day's city; no city → `DAY 2`). Eyebrow style, white on a soft dark scrim at the bottom.
- **Mark:** the Supernova star + "Supernova" small in the top corner throughout.
- **End card** 2 s: dark, star, trip title, "Plan yours on Supernova".
- Another person's public trip: only the trip title and places appear — never their name or photo.
- A tap anywhere during recording cancels (nothing saved).

## 3. Recording (iOS native module `modules/screen-recorder`)

- Swift Expo module: `isAvailable()`, `start()` → `RPScreenRecorder.shared().startCapture` writing video sample buffers to an `AVAssetWriter` (H.264 MP4, the screen's size, no audio — microphone off); `stop()` → resolves the file URI; `cancel()`. iOS asks permission the first time ("Allow screen recording in Supernova?"); a refusal rejects `start()` and the sheet says "Recording wasn't allowed. Try again when you're ready." The recorder only captures our app, never other apps or notifications.
- After `stop()`: React Native `Share.share({ url })` (Instagram, TikTok, Messages, Save Video). The temp file is deleted after the share sheet closes.
- The status bar is hidden for the recording and restored after; the screen stays awake while recording.

## 4. Android

Out of scope here: no button. Next step uses MediaCodec + PixelCopy of the map surface (own spec).

## Privacy & cost

Free, entirely on the phone, nothing uploaded. Privacy policy unchanged (no new data leaves the device unless the person shares it).

## Testing

- Pure: `filmTiming` — total ≤ 26 s for 1, 3, 7, 14, 21-day trips; short trips keep dwells; normal timing untouched (reducer defaults); captions (date range, no dates, no city).
- Device (next iOS build): permission prompt once, a ~25 s vertical MP4 with captions and end card, share to Instagram/Save Video, cancel mid-recording leaves nothing.

## Out of scope

Android, music/voice-over, choosing a single day, editing the video, server rendering.
