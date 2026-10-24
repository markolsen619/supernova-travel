# Trip Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On iPhone, one tap on the trip map records a ~25 s vertical video of the trip's flyover (captions, Supernova mark, end card) and opens the share sheet.

**Architecture:** Pure timing in `utils/flyover.ts` (`filmTiming`, reducer timing options) and captions in `utils/tripVideo.ts`; a Swift Expo module `modules/screen-recorder` (ReplayKit `startCapture` → `AVAssetWriter`); UI `components/trip/TripVideoSheet.tsx` + `components/trip/FilmOverlay.tsx`; a film state machine inside `components/trip/TripMapView.tsx`.

**Tech Stack:** Expo modules (Swift), ReplayKit, AVFoundation, React Native `Share`, Jest.

**Spec:** `docs/superpowers/specs/2026-10-24-trip-video-design.md`

## Global Constraints

- iOS only: no button on Android, and none when `ScreenRecorder.isAvailable()` is false or the module isn't in the build.
- Film timing: opening 1.5 s, end card 2 s, flyover ≤ 26 s; intro 1.2 s / dwell 0.6 s, fallback intro 0.6 s / dwell 0 when intros + dwells exceed half the budget; min drawing 1.2 s per routed day. The normal flyover (defaults) must not change.
- Never records without the person's tap on "Record video"; a tap during recording cancels and saves nothing; the temp file is deleted after sharing.
- Another person's trip: only title and places; never their name or photo.
- Copy: eyebrow `TRIP VIDEO`; "About 25 seconds of your trip from above, ready for Reels, TikTok or Stories."; "Record video"; "Not now"; "Recording wasn't allowed. Try again when you're ready."; end card "Plan yours on Supernova". Sentence case, no "!".
- The Swift module can't be compiled on this Mac (SDK 54); it first compiles in the next EAS build — keep it small and conservative.

## Review Focus

1. The recorder must be stopped/cancelled on every exit path (unmount, back, app backgrounded, error) — a leaked ReplayKit capture keeps the red recording indicator on.
2. Film mode must restore everything after (status bar, controls, keep-awake, flyover state) even when recording fails to start.
3. `filmTiming` with zero routed days, or a single day with one stop, must not divide by zero or produce NaN durations.
4. Share sheet cancel must still delete the temp file.
5. The ticker uses film timing only during film mode; a normal flyover afterwards uses the defaults again.

---

### Task 1: Film timing (pure)

**Files:** Modify `utils/flyover.ts`; Test `__tests__/utils/flyover.test.ts` (append)

**Produces:** `type FlyoverTiming = { introMs: number; dwellMs: number }`; `DEFAULT_TIMING`; actions `{ type: 'play'; timing?: FlyoverTiming }`, `{ type: 'jump'; dayIndex: number; timing?: FlyoverTiming }`, `tick` gains `timing?: FlyoverTiming`; `FILM_OPENING_MS = 1500`, `FILM_END_MS = 2000`, `FILM_BUDGET_MS = 26000`; `filmTiming(durations: number[], stopCounts: number[]): { durations: number[]; timing: FlyoverTiming; totalMs: number }` (`totalMs` = flyover only).

- [ ] **Step 1: Tests** — append:

```ts
import { filmTiming, flyoverReducer, initialFlyover, DEFAULT_TIMING, FILM_BUDGET_MS, DAY_INTRO_MS, STOP_DWELL_MS } from '@/utils/flyover';

describe('filmTiming (trip video)', () => {
  const trip = (days: number, ms = 12000, stops = 5) => ({ durations: Array(days).fill(ms), stopCounts: Array(days).fill(stops) });
  it.each([1, 3, 7, 14, 21])('a %i-day trip fits the budget', (n) => {
    const { durations, stopCounts } = trip(n);
    const f = filmTiming(durations, stopCounts);
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
    expect(f.durations.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
  });
  it('a short trip keeps its pauses at stops', () => {
    expect(filmTiming([9000, 9000], [3, 3]).timing).toEqual({ introMs: 1200, dwellMs: 600 });
  });
  it('a long trip drops the pauses', () => {
    expect(filmTiming(Array(14).fill(12000), Array(14).fill(6)).timing).toEqual({ introMs: 600, dwellMs: 0 });
  });
  it('days with no route stay 0, and nothing is NaN', () => {
    const f = filmTiming([0, 12000, 0], [1, 4, 0]);
    expect(f.durations[0]).toBe(0);
    expect(f.durations[2]).toBe(0);
    expect(Number.isFinite(f.totalMs)).toBe(true);
    expect(filmTiming([], []).totalMs).toBe(0);
  });
  it('the normal flyover is unchanged (defaults)', () => {
    expect(DEFAULT_TIMING).toEqual({ introMs: DAY_INTRO_MS, dwellMs: STOP_DWELL_MS });
    expect(flyoverReducer(initialFlyover, { type: 'play' }).hold).toBe(DAY_INTRO_MS);
    expect(flyoverReducer(initialFlyover, { type: 'play', timing: { introMs: 1200, dwellMs: 600 } }).hold).toBe(1200);
  });
  it('a film tick rests on a stop for the film dwell', () => {
    const playing = { status: 'playing' as const, dayIndex: 0, progress: 0.4, hold: 0, stopIndex: 0 };
    const s = flyoverReducer(playing, { type: 'tick', dt: 100, durations: [1000], stopFractions: [[0, 0.45]], timing: { introMs: 1200, dwellMs: 600 } });
    expect(s.hold).toBe(600);
  });
});
```

- [ ] **Step 2: Run** `npx jest __tests__/utils/flyover.test.ts` — FAIL (missing exports).
- [ ] **Step 3: Implement** in `utils/flyover.ts`:
  - `export type FlyoverTiming = { introMs: number; dwellMs: number }; export const DEFAULT_TIMING: FlyoverTiming = { introMs: DAY_INTRO_MS, dwellMs: STOP_DWELL_MS };`
  - `startOfDay(dayIndex, timing = DEFAULT_TIMING)` uses `hold: timing.introMs`; `nextDay(state, durations, timing)` passes it on.
  - `play`/`jump` use `action.timing ?? DEFAULT_TIMING`; `tick` uses `action.timing ?? DEFAULT_TIMING` for `nextDay` and the stop dwell (`hold: timing.dwellMs`). A dwell of 0 must still advance (the existing hold logic handles `hold: 0`).
  - `filmTiming`:

```ts
export const FILM_OPENING_MS = 1500;
export const FILM_END_MS = 2000;
export const FILM_BUDGET_MS = 26000;
const FILM_MIN_DAY_MS = 1200;

/** The trip video's timing: the whole flyover in ≤ 26 s (spec 2026-10-24-trip-video-design.md §2). */
export function filmTiming(durations: number[], stopCounts: number[]): { durations: number[]; timing: FlyoverTiming; totalMs: number } {
  const flown = durations.map((d, i) => d > 0 || (stopCounts[i] ?? 0) > 0);
  const days = flown.filter(Boolean).length;
  const stops = stopCounts.reduce((a, b, i) => a + (flown[i] ? b : 0), 0);
  let timing: FlyoverTiming = { introMs: 1200, dwellMs: 600 };
  if (days * timing.introMs + stops * timing.dwellMs > FILM_BUDGET_MS / 2) timing = { introMs: 600, dwellMs: 0 };
  const fixed = days * timing.introMs + stops * timing.dwellMs;
  const routed = durations.filter((d) => d > 0);
  const drawBudget = Math.max(0, FILM_BUDGET_MS - fixed);
  const wanted = routed.reduce((a, b) => a + b, 0);
  const scale = wanted > 0 ? Math.min(1, drawBudget / wanted) : 0;
  let out = durations.map((d) => (d > 0 ? Math.max(FILM_MIN_DAY_MS, Math.round(d * scale)) : 0));
  // The per-day minimum can push a very long trip over: shrink every routed day evenly to fit.
  const drawn = out.reduce((a, b) => a + b, 0);
  if (drawn > drawBudget && drawn > 0) out = out.map((d) => (d > 0 ? Math.max(1, Math.floor((d * drawBudget) / drawn)) : 0));
  return { durations: out, timing, totalMs: fixed + out.reduce((a, b) => a + b, 0) };
}
```

- [ ] **Step 4:** Run — PASS; run the whole `__tests__/utils/flyover.test.ts` (existing tests must still pass). **Step 5: Commit** `feat(flyover): film timing for the trip video`.

### Task 2: Captions (pure)

**Files:** Create `utils/tripVideo.ts`; Test `__tests__/utils/tripVideo.test.ts`

**Produces:** `openingEyebrow(start: Date | null, end: Date | null, dayCount: number): string`; `dayCaption(dayNumber: number, city: string | null): string`.

- [ ] **Step 1: Tests**

```ts
import { dayCaption, openingEyebrow } from '@/utils/tripVideo';

describe('trip video captions', () => {
  it('dates and length above the title', () => {
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 30), 6)).toBe('JUL 25 – 30 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 10, 28), new Date(2026, 11, 3), 6)).toBe('NOV 28 – DEC 3 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 25), 1)).toBe('JUL 25 · 1 DAY');
  });
  it('no dates: just the length', () => {
    expect(openingEyebrow(null, null, 4)).toBe('4 DAYS');
  });
  it('a day and its city', () => {
    expect(dayCaption(2, 'Lisbon')).toBe('DAY 2 · LISBON');
    expect(dayCaption(3, null)).toBe('DAY 3');
    expect(dayCaption(3, '  ')).toBe('DAY 3');
  });
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3: Implement**

```ts
/** Captions for the trip video (spec 2026-10-24-trip-video-design.md §2). */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const length = (n: number) => `${n} ${n === 1 ? 'DAY' : 'DAYS'}`;

export function openingEyebrow(start: Date | null, end: Date | null, dayCount: number): string {
  if (!start || !end) return length(dayCount);
  const a = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const sameDay = start.toDateString() === end.toDateString();
  const b = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear() ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${sameDay ? a : `${a} – ${b}`} · ${length(dayCount)}`;
}

export function dayCaption(dayNumber: number, city: string | null): string {
  const c = city?.trim();
  return c ? `DAY ${dayNumber} · ${c.toUpperCase()}` : `DAY ${dayNumber}`;
}
```

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(trip-video): captions`.

### Task 3: Screen recorder module (Swift)

**Files:** Create `modules/screen-recorder/expo-module.config.json`, `modules/screen-recorder/ios/ScreenRecorder.podspec`, `modules/screen-recorder/ios/ScreenRecorderModule.swift`, `modules/screen-recorder/index.ts`. Follow `modules/add-pass-button` exactly for the config/podspec/JS-guard pattern (read those files first).

- [ ] **Step 1: config** `{ "platforms": ["apple"], "apple": { "modules": ["ScreenRecorderModule"] } }`; podspec copied from AddPassButton with names changed and `s.frameworks = 'ReplayKit', 'AVFoundation'`.
- [ ] **Step 2: Swift**

```swift
import ExpoModulesCore
import ReplayKit
import AVFoundation

/// Records only this app's screen for the trip video (spec 2026-10-24-trip-video-design.md §3). No audio.
public class ScreenRecorderModule: Module {
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var started = false
  private var url: URL?
  private let queue = DispatchQueue(label: "supernova.screenrecorder")

  public func definition() -> ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { () -> Bool in
      RPScreenRecorder.shared().isAvailable
    }

    AsyncFunction("start") { (promise: Promise) in
      let recorder = RPScreenRecorder.shared()
      recorder.isMicrophoneEnabled = false
      self.reset()
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("supernova-trip-\(UUID().uuidString).mp4")
      self.url = file
      recorder.startCapture(handler: { buffer, type, error in
        guard error == nil, type == .video else { return }
        self.queue.sync { self.append(buffer) }
      }, completionHandler: { error in
        if let error = error { promise.reject("E_RECORD_START", error.localizedDescription) } else { promise.resolve(nil) }
      })
    }

    AsyncFunction("stop") { (promise: Promise) in
      RPScreenRecorder.shared().stopCapture { _ in
        self.queue.async {
          guard let writer = self.writer, let input = self.input, self.started else {
            promise.reject("E_RECORD_EMPTY", "Nothing was recorded"); self.reset(); return
          }
          input.markAsFinished()
          writer.finishWriting {
            if writer.status == .completed, let url = self.url { promise.resolve(url.absoluteString) }
            else { promise.reject("E_RECORD_WRITE", writer.error?.localizedDescription ?? "Couldn't save the video") }
            self.writer = nil; self.input = nil; self.started = false
          }
        }
      }
    }

    AsyncFunction("cancel") { (promise: Promise) in
      RPScreenRecorder.shared().stopCapture { _ in
        self.queue.async {
          self.writer?.cancelWriting()
          if let url = self.url { try? FileManager.default.removeItem(at: url) }
          self.reset()
          promise.resolve(nil)
        }
      }
    }
  }

  private func reset() {
    writer = nil; input = nil; started = false
  }

  private func append(_ buffer: CMSampleBuffer) {
    guard CMSampleBufferDataIsReady(buffer) else { return }
    if writer == nil {
      guard let url = url, let image = CMSampleBufferGetImageBuffer(buffer) else { return }
      let width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
      guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
      let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height]
      let i = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
      i.expectsMediaDataInRealTime = true
      guard w.canAdd(i) else { return }
      w.add(i)
      writer = w; input = i
    }
    guard let writer = writer, let input = input else { return }
    if !started {
      guard writer.startWriting() else { return }
      writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(buffer))
      started = true
    }
    if input.isReadyForMoreMediaData { input.append(buffer) }
  }
}
```

- [ ] **Step 3: JS** `modules/screen-recorder/index.ts`:

```ts
import { requireOptionalNativeModule } from 'expo-modules-core';

type Recorder = { isAvailable(): boolean; start(): Promise<void>; stop(): Promise<string>; cancel(): Promise<void> };

/** Records this app's screen for the trip video (iOS; null in builds without the module and on Android). */
export const ScreenRecorder: Recorder | null = requireOptionalNativeModule<Recorder>('ScreenRecorder');
```

(If `requireOptionalNativeModule` isn't exported by the installed expo-modules-core, use the same guard `modules/add-pass-button/index.ts` uses.)

- [ ] **Step 4:** `npx tsc --noEmit -p .` clean; `git check-ignore -v modules/screen-recorder/ios/ScreenRecorderModule.swift` prints nothing (must reach git and EAS). **Step 5: Commit** `feat(trip-video): iOS screen recorder module`.

### Task 4: Sheet and film overlay

**Files:** Create `components/trip/TripVideoSheet.tsx`, `components/trip/FilmOverlay.tsx`

- [ ] **Step 1: `TripVideoSheet({ visible, tripTitle, error, busy, onRecord, onClose })`** — RN `Modal` (transparent, slide) bottom sheet on the dark trip map palette (the trip map is an always-dark screen per Architecture Rule 3, so `DarkColors` may be used): eyebrow `TRIP VIDEO`, title = trip title, body copy from Global Constraints, `error` line in the error colour when set, primary `Button` **"Record video"** (`loading={busy}`, `haptic="medium"`), text link **"Not now"** (44pt).
- [ ] **Step 2: `FilmOverlay({ phase, eyebrow, title, caption })`** — `pointerEvents="box-none"` full-screen overlay: top-right mark (Supernova star 22×22 + "Supernova", white, 13/600, soft shadow); `phase === 'opening'`: centred eyebrow + big title (30/600) over a dark scrim, fading in (`Animated` 400 ms); `phase === 'flying'`: bottom caption pill (eyebrow style, white on `rgba(0,0,0,0.45)`) showing `caption`, cross-fading when it changes; `phase === 'end'`: full dark card (`#0B0A12`), star 64×64, trip title, "Plan yours on Supernova".
- [ ] **Step 3:** tsc + eslint clean. **Step 4: Commit** `feat(trip-video): sheet and film overlay`.

### Task 5: Film mode in the trip map

**Files:** Modify `components/trip/TripMapView.tsx`, `app/trip/[id].tsx`

- [ ] **Step 1: Props** — add `tripStartDate?: Date | null` and `dayCities?: Record<string, string | null>` (day id → city). In `app/trip/[id].tsx` pass `tripStartDate={trip.startDate ? trip.startDate.toDate() : null}` and `dayCities` built from the trip's destinations with `resolveDayDestinationIndices(sortedDays, destinationNames)` (`utils/dayDestination.ts`) — the same names the city sections use.
- [ ] **Step 2: State** — `type FilmPhase = 'idle' | 'confirm' | 'starting' | 'opening' | 'flying' | 'end' | 'saving'`; `const [film, setFilm] = useState<FilmPhase>('idle'); const filming = film !== 'idle' && film !== 'confirm';` `const film$ = useMemo(() => filmTiming(durations, flightPaths.map((d) => d.stops.length)), [durations, flightPaths]);`
- [ ] **Step 3: Ticker** — in the existing tick effect use `filming ? film$.durations : durations` and pass `timing: filming ? film$.timing : undefined`; the camera effect's `dayMs` uses the same durations.
- [ ] **Step 4: Flow** (one `useCallback` each):
  - `openVideo` (button) → `setFilm('confirm')`.
  - `record` → `setFilm('starting')`; `await ScreenRecorder.start()` (on error: `setFilm('confirm')` + error text, return); `StatusBar.setHidden(true)`; `activateKeepAwakeAsync('trip-video')`; close selection/picker; `dispatch({ type: 'stop' })`; `fitAllStops()`; `setFilm('opening')`; after `FILM_OPENING_MS` → `dispatch({ type: 'play', timing: film$.timing })`; `setFilm('flying')`.
  - When `filming && film === 'flying' && flyover.status === 'done'` → `setFilm('end')`; after `FILM_END_MS` → `setFilm('saving')`; `const uri = await ScreenRecorder.stop()`; `finishFilm()`; `await Share.share({ url: uri })`; then delete `uri` with `expo-file-system` (`FileSystem.deleteAsync(uri, { idempotent: true })`) in `finally`.
  - `cancelFilm` (a full-screen transparent `Pressable` above the map while filming, and on unmount / app background via `AppState`) → `ScreenRecorder.cancel()`, `finishFilm()`.
  - `finishFilm` → `StatusBar.setHidden(false)`, `deactivateKeepAwake('trip-video')`, `dispatch({ type: 'stop' })`, `setFilm('idle')`, `fitAllStops()`.
- [ ] **Step 5: Hide chrome while filming** — wrap the header, the bottom card/sheets, the picker, the mode switch, the flyover card and any floating buttons in `{!filming && …}`; render `<FilmOverlay phase=… eyebrow={openingEyebrow(tripStartDate, tripEndDate, days.length)} title={tripTitle} caption={dayCaption(...)} />` while filming. The caption uses the day of the stop the flyover is heading to (`flightPaths[flyover.dayIndex]?.stops[Math.max(0, flyover.stopIndex)]?.dayId` → that day's `dayNumber` and `dayCities[dayId]`), so it is right for both per-day and whole-trip flyovers.
- [ ] **Step 6: Button** — in the header, after the play button: when `Platform.OS === 'ios' && ScreenRecorder?.isAvailable() && canFly && placedStopCount >= 2`, a circle button with Phosphor `VideoCamera` (white, bold), `accessibilityLabel="Share a video of this trip"`, `onPress={openVideo}`. Render `<TripVideoSheet visible={film === 'confirm' || film === 'starting'} … />`.
- [ ] **Step 7:** Check `expo-keep-awake` and `expo-file-system` are installed (`package.json`); if `expo-keep-awake` isn't, skip keep-awake (a 30 s recording won't hit auto-lock) and record a ruling.
- [ ] **Step 8:** `npx tsc --noEmit -p . && npx eslint components/trip/TripMapView.tsx "app/trip/[id].tsx" && npx jest` — clean / all pass. **Step 9: Commit** `feat(trip-video): record the flyover from the trip map`.

### Task 6: Docs

- [ ] CLAUDE.md — a **Trip video** bullet in Utils (spec path; `filmTiming`/`FlyoverTiming` in `utils/flyover.ts`, captions `utils/tripVideo.ts`, `modules/screen-recorder` (ReplayKit, iOS only, first compiled in the next EAS build), `TripVideoSheet` / `FilmOverlay`, film mode in `TripMapView`; Android pending). Commit `docs: trip video`.
