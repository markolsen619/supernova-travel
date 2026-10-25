# Android Trip Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trip video works on Android: frame capture of the map surface + the film overlay, encoded to MP4, shared with Android's share sheet. No system prompt.

**Architecture:** Pure pacing/sizing in `utils/tripVideo.ts`; Kotlin in `modules/screen-recorder/android` (PixelCopy → overlay `View.draw` → `MediaCodec` input surface → `MediaMuxer`); JS wrapper picks the platform path; `TripMapView` passes view tags on Android and shares with `expo-sharing`.

**Tech Stack:** Expo modules (Kotlin), PixelCopy, MediaCodec/MediaMuxer, Choreographer, expo-sharing 14.0.x.

**Spec:** `docs/superpowers/specs/2026-10-25-android-trip-video-design.md`

## Global Constraints

- No MediaProjection, no system prompt, no new permission.
- ≤ 30 fps (≥ 33 ms between captures; drop frames, never slow the film); output ≤ 1080 px wide, even dimensions, aspect kept; 10 Mbps; H.264 MP4; no audio.
- Every exit path releases codec, muxer, threads, bitmaps and the frame callback; cancel deletes the file; screen-on flag cleared.
- iPhone behaviour unchanged.
- Kotlin can't be compiled on this Mac (no kotlinc / Android SDK): first compile in the next EAS Android build. Keep it conservative; only standard Android APIs.

## Review Focus

1. Thread safety between the Choreographer (main), PixelCopy callback thread and the encoder thread — bitmaps reused across threads must not be written while being drawn.
2. `stop()` before any frame was encoded (muxer never started) must not crash (`MediaMuxer.stop()` throws if not started) and must reject cleanly.
3. The overlay view is drawn with `View.draw` — RN views using native-driver animations (opacity/scale on `FilmOverlay`) must render their current animated values.
4. `findView(tag)` returning null (view not mounted / collapsed) → `startViews` rejects, the app returns to the sheet with the error line.
5. The SurfaceView may have size 0 at start (layout) → reject rather than create a 0×0 codec.

---

### Task 1: Pacing and sizing (pure)

**Files:** Modify `utils/tripVideo.ts`; Test `__tests__/utils/tripVideo.test.ts`

- [ ] **Step 1: Tests**

```ts
describe('android frame capture rules', () => {
  it('captures at most every 33 ms', () => {
    expect(shouldCaptureFrame(null, 1000)).toBe(true);
    expect(shouldCaptureFrame(1000, 1020)).toBe(false);
    expect(shouldCaptureFrame(1000, 1033)).toBe(true);
  });
  it('output ≤ 1080 wide, even, aspect kept', () => {
    expect(outputSize(1440, 3088)).toEqual({ width: 1080, height: 2316 });
    expect(outputSize(1079, 2337)).toEqual({ width: 1078, height: 2336 });
    expect(outputSize(720, 1600)).toEqual({ width: 720, height: 1600 });
  });
  it('nothing to record gives null', () => {
    expect(outputSize(0, 2000)).toBeNull();
    expect(outputSize(1080, 1)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3: Implement**

```ts
export const FRAME_INTERVAL_MS = 33;
/** Android frame capture (spec 2026-10-25): ≤ 30 fps — a busy frame is dropped, the film is never slowed. */
export function shouldCaptureFrame(lastMs: number | null, nowMs: number): boolean {
  return lastMs === null || nowMs - lastMs >= FRAME_INTERVAL_MS;
}
/** The encoded video's size: ≤ 1080 px wide, even dimensions (H.264), aspect kept; null when there's nothing to record. */
export function outputSize(width: number, height: number): { width: number; height: number } | null {
  if (width < 2 || height < 2) return null;
  const scale = Math.min(1, 1080 / width);
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}
```

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(trip-video): android frame pacing and sizing rules`.

### Task 2: Kotlin recorder

**Files:** Modify `modules/screen-recorder/expo-module.config.json`, `modules/screen-recorder/index.ts`; Create `modules/screen-recorder/android/build.gradle`, `modules/screen-recorder/android/src/main/AndroidManifest.xml`, `modules/screen-recorder/android/src/main/java/expo/modules/screenrecorder/ScreenRecorderModule.kt`

- [ ] **Step 1: config** → `{ "platforms": ["apple", "android"], "apple": { "modules": ["ScreenRecorderModule"] }, "android": { "modules": ["expo.modules.screenrecorder.ScreenRecorderModule"] } }`.
- [ ] **Step 2: build.gradle**

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'com.supernovatravel'
version = '1.0.0'

android {
  namespace "expo.modules.screenrecorder"
  defaultConfig {
    versionCode 1
    versionName '1.0.0'
  }
}
```

  `AndroidManifest.xml`: `<manifest xmlns:android="http://schemas.android.com/apk/res/android" />`.

- [ ] **Step 3: Kotlin** — `ScreenRecorderModule.kt`:

```kotlin
package expo.modules.screenrecorder

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Choreographer
import android.view.PixelCopy
import android.view.Surface
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The trip video on Android (spec 2026-10-25-android-trip-video-design.md): ~30 times a second the map's surface is
 * copied (PixelCopy), the film overlay view is drawn on top, and the frame goes to an H.264 encoder. No screen
 * recording, so no system prompt.
 */
class ScreenRecorderModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var copyThread: HandlerThread? = null
  private var encodeThread: HandlerThread? = null
  private var codec: MediaCodec? = null
  private var inputSurface: Surface? = null
  private var muxer: MediaMuxer? = null
  private var track = -1
  private var muxerStarted = false
  private var file: File? = null
  private var mapView: View? = null
  private var overlay: View? = null
  private var mapBitmap: Bitmap? = null
  private var overlayBitmap: Bitmap? = null
  private var outW = 0
  private var outH = 0
  private var lastFrameMs = -1L
  private val running = AtomicBoolean(false)
  private val busy = AtomicBoolean(false)
  private var frameCallback: Choreographer.FrameCallback? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.N }

    AsyncFunction("startViews") { mapRootTag: Int, overlayTag: Int, promise: Promise ->
      main.post {
        try {
          cleanup(deleteFile = true)
          val root = appContext.findView<View>(mapRootTag) ?: throw IllegalStateException("Map view not found")
          val surface = findSurface(root) ?: throw IllegalStateException("Map surface not found")
          val over = appContext.findView<View>(overlayTag) ?: throw IllegalStateException("Overlay not found")
          val w = surface.width
          val h = surface.height
          if (w < 2 || h < 2) throw IllegalStateException("Map not laid out")
          val scale = minOf(1f, 1080f / w)
          outW = maxOf(2, ((w * scale).toInt() / 2) * 2)
          outH = maxOf(2, ((h * scale).toInt() / 2) * 2)
          mapView = surface
          overlay = over
          mapBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          overlayBitmap = Bitmap.createBitmap(over.width.coerceAtLeast(1), over.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
          val out = File(appContext.reactContext?.cacheDir ?: throw IllegalStateException("No cache dir"), "supernova-trip-${UUID.randomUUID()}.mp4")
          file = out
          startEncoder(out)
          appContext.currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          running.set(true)
          lastFrameMs = -1L
          val cb = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
              if (!running.get()) return
              val now = frameTimeNanos / 1_000_000
              if ((lastFrameMs < 0 || now - lastFrameMs >= 33) && busy.compareAndSet(false, true)) {
                lastFrameMs = now
                captureFrame()
              }
              Choreographer.getInstance().postFrameCallback(this)
            }
          }
          frameCallback = cb
          Choreographer.getInstance().postFrameCallback(cb)
          promise.resolve(null)
        } catch (e: Exception) {
          cleanup(deleteFile = true)
          promise.reject("E_RECORD_START", e.message ?: "Couldn't start recording", e)
        }
      }
    }

    AsyncFunction("stop") { promise: Promise ->
      main.post {
        running.set(false)
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val handler = encodeThread?.let { Handler(it.looper) }
        if (handler == null) {
          cleanup(deleteFile = true)
          promise.reject("E_RECORD_EMPTY", "Nothing was recorded", null)
          return@post
        }
        handler.post {
          try {
            codec?.signalEndOfInputStream()
            drain(endOfStream = true)
            val ok = muxerStarted
            val out = file
            releaseEncoder()
            main.post {
              cleanup(deleteFile = !ok)
              if (ok && out != null) promise.resolve(Uri.fromFile(out).toString())
              else promise.reject("E_RECORD_EMPTY", "Nothing was recorded", null)
            }
          } catch (e: Exception) {
            releaseEncoder()
            main.post {
              cleanup(deleteFile = true)
              promise.reject("E_RECORD_WRITE", e.message ?: "Couldn't save the video", e)
            }
          }
        }
      }
    }

    AsyncFunction("cancel") { promise: Promise ->
      main.post {
        running.set(false)
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val handler = encodeThread?.let { Handler(it.looper) }
        if (handler == null) {
          cleanup(deleteFile = true)
          promise.resolve(null)
          return@post
        }
        handler.post {
          releaseEncoder()
          main.post { cleanup(deleteFile = true); promise.resolve(null) }
        }
      }
    }

    Function("discard") { uri: String ->
      Uri.parse(uri).path?.let { File(it).delete() }
      Unit
    }

    OnDestroy {
      running.set(false)
      main.post {
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        encodeThread?.let { t -> Handler(t.looper).post { releaseEncoder(); main.post { cleanup(deleteFile = true) } } } ?: cleanup(deleteFile = true)
      }
    }
  }

  /** The first SurfaceView or TextureView under the map's root (Mapbox draws into one of them). */
  private fun findSurface(v: View): View? {
    if (v is SurfaceView || v is TextureView) return v
    if (v is ViewGroup) for (i in 0 until v.childCount) findSurface(v.getChildAt(i))?.let { return it }
    return null
  }

  private fun startEncoder(out: File) {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, outW, outH).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, 10_000_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, 30)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    inputSurface = c.createInputSurface()
    c.start()
    codec = c
    muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    track = -1
    muxerStarted = false
    copyThread = HandlerThread("supernova-copy").also { it.start() }
    encodeThread = HandlerThread("supernova-encode").also { it.start() }
  }

  /** Main thread: copy the map, then draw the overlay, then hand both to the encoder thread. */
  private fun captureFrame() {
    val map = mapView
    val mapBmp = mapBitmap
    val copy = copyThread
    if (map == null || mapBmp == null || copy == null) { busy.set(false); return }
    val afterCopy = { ok: Boolean ->
      main.post {
        if (!ok || !running.get()) { busy.set(false); return@post }
        drawOverlay()
        val enc = encodeThread
        if (enc == null) { busy.set(false); return@post }
        Handler(enc.looper).post { encodeFrame(); busy.set(false) }
      }
    }
    when (map) {
      is SurfaceView -> try {
        PixelCopy.request(map, mapBmp, { result -> afterCopy(result == PixelCopy.SUCCESS) }, Handler(copy.looper))
      } catch (e: Exception) { busy.set(false) }
      is TextureView -> { map.getBitmap(mapBmp); afterCopy(true) }
      else -> busy.set(false)
    }
  }

  private fun drawOverlay() {
    val over = overlay ?: return
    var bmp = overlayBitmap ?: return
    if (bmp.width != over.width || bmp.height != over.height) {
      if (over.width < 1 || over.height < 1) return
      bmp.recycle()
      bmp = Bitmap.createBitmap(over.width, over.height, Bitmap.Config.ARGB_8888)
      overlayBitmap = bmp
    }
    bmp.eraseColor(Color.TRANSPARENT)
    over.draw(Canvas(bmp))
  }

  /** Encoder thread: map then overlay onto the codec's input surface, then pull out what's encoded. */
  private fun encodeFrame() {
    val surface = inputSurface ?: return
    val map = mapBitmap ?: return
    val canvas = try { surface.lockHardwareCanvas() } catch (e: Exception) { return }
    try {
      canvas.drawColor(Color.BLACK, PorterDuff.Mode.SRC)
      val dst = Rect(0, 0, outW, outH)
      canvas.drawBitmap(map, null, dst, null)
      overlayBitmap?.let { canvas.drawBitmap(it, null, dst, null) }
    } finally {
      surface.unlockCanvasAndPost(canvas)
    }
    drain(endOfStream = false)
  }

  private fun drain(endOfStream: Boolean) {
    val c = codec ?: return
    val m = muxer ?: return
    val info = MediaCodec.BufferInfo()
    while (true) {
      val index = c.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (!muxerStarted) { track = m.addTrack(c.outputFormat); m.start(); muxerStarted = true }
        }
        index >= 0 -> {
          val buf = c.getOutputBuffer(index)
          if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0
          if (info.size > 0 && muxerStarted && buf != null) {
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            m.writeSampleData(track, buf, info)
          }
          c.releaseOutputBuffer(index, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
        }
      }
    }
  }

  /** Encoder thread. */
  private fun releaseEncoder() {
    try { codec?.stop() } catch (_: Exception) {}
    try { codec?.release() } catch (_: Exception) {}
    try { inputSurface?.release() } catch (_: Exception) {}
    try { if (muxerStarted) muxer?.stop() } catch (_: Exception) {}
    try { muxer?.release() } catch (_: Exception) {}
    codec = null; inputSurface = null; muxer = null
  }

  /** Main thread. */
  private fun cleanup(deleteFile: Boolean) {
    running.set(false)
    frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
    frameCallback = null
    appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    copyThread?.quitSafely(); copyThread = null
    encodeThread?.quitSafely(); encodeThread = null
    mapBitmap?.recycle(); mapBitmap = null
    overlayBitmap?.recycle(); overlayBitmap = null
    mapView = null; overlay = null
    if (deleteFile) file?.delete()
    file = null
    muxerStarted = false
    busy.set(false)
  }
}
```

Notes for the implementer: `PixelCopy.request(SurfaceView, Bitmap, listener, Handler)` is API 24; `lockHardwareCanvas` is API 23. `stop()` before any frame: the muxer never started → reject `E_RECORD_EMPTY`, no `muxer.stop()` (guarded). The encoder-thread lambda in `stop` reads `muxerStarted` after `drain(true)`.

- [ ] **Step 4: JS wrapper** — `index.ts` type gains `startViews(mapRootTag: number, overlayTag: number): Promise<void>`; document that `start` is iOS and `startViews` is Android.
- [ ] **Step 5:** `npx tsc --noEmit -p .` clean; `git check-ignore` on every new file prints nothing; `npx expo-modules-autolinking search | grep -A8 screen-recorder` shows android. **Step 6: Commit** `feat(trip-video): android frame-capture recorder`.

### Task 3: App wiring + expo-sharing

**Files:** `package.json` (via `npx expo install expo-sharing`), `components/trip/TripMapView.tsx`, `components/trip/FilmOverlay.tsx`

- [ ] **Step 1:** `npx expo install expo-sharing` (adds ~14.0.x). Check `app.json` plugins need nothing (expo-sharing has no config plugin requirement for sharing local files on Android in SDK 54 — verify in its README; if it lists a plugin, add it).
- [ ] **Step 2: FilmOverlay** — accept a forwarded ref (`React.forwardRef<View, …>`) on its root `View`s, with `collapsable={false}` so Android keeps a real view to draw.
- [ ] **Step 3: TripMapView**
  - `recorderAvailable`: `(Platform.OS === 'ios' || Platform.OS === 'android') && !!ScreenRecorder && isAvailable()`.
  - `const overlayRef = useRef<View>(null)`; pass `ref={overlayRef}` to `FilmOverlay`.
  - In `recordVideo`, replace the start call: iOS keeps `measureInWindow` + `ScreenRecorder.start(…)`; Android: the overlay only mounts once filming, so on Android set `setFilm('opening')` **first** (mounting the overlay; chrome hides), wait one frame (`await new Promise((r) => requestAnimationFrame(() => r(null)))`), then `ScreenRecorder.startViews(findNodeHandle(rootRef.current)!, findNodeHandle(overlayRef.current)!)`; on failure `finishFilm()` then show the sheet error (`setFilm('confirm')` + error). The opening timer/play starts after `startViews` resolves (same as iOS).
  - Sharing: after `stop()`, Android → `await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Share your trip video', UTI: 'public.mpeg-4' })`; iOS unchanged; `discard(uri)` in `finally` for both.
- [ ] **Step 4:** `npx tsc --noEmit -p . && npx eslint components/trip/TripMapView.tsx components/trip/FilmOverlay.tsx && npx jest` — clean / pass. **Step 5: Commit** `feat(trip-video): record and share on Android`.

### Task 4: Docs

- [ ] CLAUDE.md Trip video bullet: "Android (2026-10-25): frame capture in `modules/screen-recorder/android` (PixelCopy of Mapbox's SurfaceView + `FilmOverlay` drawn on top → MediaCodec H.264 → MediaMuxer; ≤ 30 fps, ≤ 1080 wide; no prompt), shared with `expo-sharing`". Commit `docs: android trip video`.
