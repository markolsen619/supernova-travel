# Trip video on Android — design

Date: 2026-10-25 · Status: approved in conversation · Follows `2026-10-24-trip-video-design.md` (iPhone)

## Why

The iPhone trip video works (build 43, owner tested 2026-10-25). Android shows no button. Android's system screen recording (MediaProjection) prompts "Start recording?" every time and needs a Play Console foreground-service declaration, so the owner chose **frame capture**: no prompt, no declaration.

## Decisions (owner, 2026-10-25)

- Same experience as iPhone: button, sheet, film mode, timing, captions, members' photos (trips you're on only), mark, end card, tap to cancel, file deleted after sharing.
- Frame capture, no system prompt.
- Add **`expo-sharing`** (Expo's official package, 14.0.x for SDK 54) for Android's share sheet; iPhone keeps React Native `Share`.

## 1. Recording (Kotlin, in `modules/screen-recorder`)

- `expo-module.config.json` gains `"android"` (`expo.modules.screenrecorder.ScreenRecorderModule`); `android/build.gradle` like other local Expo modules; `ScreenRecorderModule.kt`.
- API (Android): `isAvailable()` (API ≥ 24 — every supported phone), `startViews(mapRootTag, overlayTag)`, `stop()` → `file://…mp4`, `cancel()`, `discard(uri)`. The JS wrapper picks `start` (iOS) or `startViews` (Android).
- **Frames:** a `Choreographer` frame callback at most every 33 ms (≈ 30 fps; frames are dropped, never the film slowed):
  1. `PixelCopy.request(mapSurface, mapBitmap, …, captureThread)` — `mapSurface` is the first `SurfaceView` (Mapbox's default on Android) found under the map root (`appContext.findView(mapRootTag)`); a `TextureView` is read with `getBitmap()` instead.
  2. On the main thread: the overlay view (`FilmOverlay`'s root, `appContext.findView(overlayTag)`) drawn into a cleared ARGB bitmap with `View.draw(canvas)`.
  3. On the encoder thread: map bitmap, then overlay bitmap, drawn onto the encoder's input surface (`lockHardwareCanvas` → `unlockCanvasAndPost`).
- **Encoding:** `MediaCodec` `video/avc`, `COLOR_FormatSurface`, the map view's size scaled to ≤ 1080 px wide (even dimensions), 10 Mbps, 30 fps, I-frame every 1 s; a drain thread writes to `MediaMuxer` (MP4). No audio.
- Screen kept on (`FLAG_KEEP_SCREEN_ON`) while recording; cleared on stop/cancel/error.
- Every exit path (stop, cancel, error, the module being destroyed) stops the frame callback, releases the codec, muxer, threads and bitmaps; cancel deletes the file.

## 2. App

- `TripMapView`: `canRecord` true on Android when the module is present and `isAvailable()`; the root `View` and `FilmOverlay`'s root get `collapsable={false}` and their tags (`findNodeHandle`) go to `startViews` after the sheet closes (the iOS path keeps `measureInWindow` + `start`).
- Sharing: Android → `Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share your trip video' })`; iPhone unchanged. `discard(uri)` after either.
- Everything else (timing, captions, photos, cancel rules) is shared with iPhone unchanged.

## Testing

- Pure: the frame-pacing rule (`shouldCaptureFrame(lastMs, nowMs)` — ≥ 33 ms) and output sizing (`outputSize(w, h)` — ≤ 1080 wide, even, aspect kept) in `utils/tripVideo.ts`, mirrored in Kotlin.
- Device (Android 1.0.8 next build): a ~26 s MP4 with map + captions + photos + end card, no prompt, share to Instagram/WhatsApp, cancel leaves nothing; check smoothness on a mid-range phone.

## Out of scope

Audio/music, MediaProjection, choosing a day.
