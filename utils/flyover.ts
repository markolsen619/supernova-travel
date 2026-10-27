/**
 * The trip map's day-by-day flyover as a pure state machine. Each day's route
 * draws itself, resting STOP_DWELL_MS on every stop it reaches so the camera
 * and card can show that stop. The component
 * dispatches `tick` from requestAnimationFrame; everything about pacing,
 * rolling into the next day and finishing is decided here, where it's tested.
 */
export type FlyoverStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface FlyoverState {
  status: FlyoverStatus;
  dayIndex: number;
  /** 0 → 1 along the current day's path. */
  progress: number;
  /** Milliseconds still to dwell on the current stop before drawing on. */
  hold: number;
  /** The current day's stop last reached, shown in the card; −1 when idle. */
  stopIndex: number;
}

export type FlyoverAction =
  | { type: 'play'; timing?: FlyoverTiming }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[]; stopFractions: number[][]; timing?: FlyoverTiming }
  | { type: 'jump'; dayIndex: number; timing?: FlyoverTiming }
  | { type: 'stop' };

/**
 * How long the flyover rests on each stop — the camera settles on it and the
 * card shows it — before drawing on to the next. The first stop of a day gets
 * the same rest, which also gives the map time to load its tiles.
 */
export const STOP_DWELL_MS = 2500;
/** A day opens on its whole route from above, then comes down to its first stop (TripMapView). */
export const DAY_INTRO_MS = 4000;

/** How long a day opens and each stop rests. The trip video passes faster ones (filmTiming); the normal flyover uses these. */
export type FlyoverTiming = {
  introMs: number;
  dwellMs: number;
  /** Per day, per stop: a pause that overrides `dwellMs` (the trip video rests longer on stops with a photo). */
  dwells?: number[][];
  /** The shortest time a leg between two stops is drawn (0: by distance only — the squeezed video). */
  legMinMs?: number;
};

/**
 * Every leg between two stops is drawn for at least this long (owner, 2026-10-26): by distance alone, London's
 * 400 m legs got ~0.35 s each beside a 4.8 km one, and the playback seemed to jump from stop to stop.
 */
export const LEG_MIN_MS = 3000;
export const DEFAULT_TIMING: FlyoverTiming = { introMs: DAY_INTRO_MS, dwellMs: STOP_DWELL_MS, legMinMs: LEG_MIN_MS };

/**
 * Drawing speed (path fraction per ms) on the leg after stop `stopIndex`: the day's pace, slowed on a short leg so
 * it lasts at least `legMinMs`. After the last stop (or with no stops), the day's pace.
 */
export function legSpeed(stopFractions: number[], stopIndex: number, durationMs: number, legMinMs: number): number {
  const base = durationMs > 0 ? 1 / durationMs : 0;
  const from = stopFractions[stopIndex] ?? 0;
  const to = stopFractions[stopIndex + 1];
  if (to === undefined || legMinMs <= 0 || durationMs <= 0) return base;
  const frac = to - from;
  if (frac <= 0) return base;
  return frac / Math.max(frac * durationMs, legMinMs);
}

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0, hold: 0, stopIndex: -1 };

const startOfDay = (dayIndex: number, timing: FlyoverTiming = DEFAULT_TIMING): FlyoverState => ({ status: 'playing', dayIndex, progress: 0, hold: timing.introMs, stopIndex: 0 });

function nextDay(state: FlyoverState, durations: number[], timing: FlyoverTiming = DEFAULT_TIMING): FlyoverState {
  if (state.dayIndex >= durations.length - 1) return { ...state, status: 'done', progress: 1, hold: 0 };
  return startOfDay(state.dayIndex + 1, timing);
}

/**
 * 6 s for a walkable day up to 18 s for a long one. The first version ran
 * 4–12 s and moved faster than the map could render.
 */
export function dayDurationMs(meters: number): number {
  return Math.round(Math.min(18_000, 6_000 + meters / 12));
}

export function flyoverReducer(state: FlyoverState, action: FlyoverAction): FlyoverState {
  switch (action.type) {
    case 'play':
      if (state.status === 'done' || state.status === 'idle') return startOfDay(0, action.timing);
      return { ...state, status: 'playing' };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'stop':
      return initialFlyover;
    case 'jump':
      return startOfDay(action.dayIndex, action.timing);
    case 'tick': {
      if (state.status !== 'playing') return state;
      const timing = action.timing ?? DEFAULT_TIMING;
      const duration = action.durations[state.dayIndex] ?? 0;
      if (duration <= 0) {
        // No route to draw. A day with one stop still rests on it — often the
        // arrival day's hotel — and a day with no stops is skipped outright.
        const hasStop = (action.stopFractions[state.dayIndex]?.length ?? 0) > 0;
        if (!hasStop || state.hold <= 0) return nextDay(state, action.durations, timing);
        return { ...state, hold: state.hold - Math.min(state.hold, action.dt) };
      }
      let dt = action.dt;
      if (state.hold > 0) {
        const hold = state.hold - Math.min(state.hold, dt);
        dt -= state.hold - hold;
        if (hold > 0 || dt <= 0) return { ...state, hold };
      }
      if (state.progress >= 1) return nextDay(state, action.durations, timing);
      const speed = legSpeed(action.stopFractions[state.dayIndex] ?? [], state.stopIndex, duration, timing.legMinMs ?? 0);
      const progress = Math.min(1, state.progress + dt * speed);
      // The next stop on the line: stop the head there and dwell. One stop per
      // tick, so two stops at the same spot each get their own pause.
      const next = state.stopIndex + 1;
      const at = action.stopFractions[state.dayIndex]?.[next];
      if (at !== undefined && progress >= at) return { ...state, progress: at, stopIndex: next, hold: timing.dwells?.[state.dayIndex]?.[next] ?? timing.dwellMs };
      if (progress >= 1) return nextDay(state, action.durations, timing);
      return { ...state, progress, hold: 0 };
    }
  }
}

export const FILM_OPENING_MS = 1500;
export const FILM_END_MS = 2000;
export const FILM_BUDGET_MS = 54000;
const FILM_MIN_DAY_MS = 1200;

export const FILM_PHOTO_DWELL_MS = 1500;
export const FILM_STOP_DWELL_MS = 1000;
export const FILM_STOPS_PER_DAY = 4;
/** How long the video holds a stop with a photo when it plays like the playback — long enough to see it. */
export const FILM_PHOTO_HOLD_MS = 3500;

/**
 * Which stops of a day get a real pause in the trip video: its photo stops first, then spread across the day
 * (first, last, evenly between), at most `k`. A day with `k` stops or fewer: every stop.
 */
export function featuredStops(n: number, photos: number[], k: number): Set<number> {
  const out = new Set<number>();
  if (n <= 0 || k <= 0) return out;
  for (const p of photos) if (p >= 0 && p < n && out.size < k) out.add(p);
  if (n <= k) { for (let i = 0; i < n; i++) out.add(i); return out; }
  const spread = Array.from({ length: k }, (_, i) => (k === 1 ? 0 : Math.round((i * (n - 1)) / (k - 1))));
  for (const i of spread) if (out.size < k) out.add(i);
  for (let i = 0; i < n && out.size < k; i++) out.add(i);
  return out;
}

/**
 * The trip video's timing, in ≤ 54 s (about a minute with the opening and end card). When the trip fits it plays
 * exactly like the playback — 4 s day openings, 2.5 s close-ups at every stop (3.5 s with a photo), the route at
 * full speed (owner, 2026-10-25: the squeezed version felt rushed). Otherwise it gives up only as much as it must:
 * slightly shorter close-ups with the route slowed no more than 40 %, then 4 close-ups a day, then quick 1 s
 * pauses at every stop, then fewer per day and shorter openings (an 8-day trip once rushed through without stopping).
 * `photoStops` lists, per day, the stop indices that show a photo.
 */
export function filmTiming(durations: number[], stopCounts: number[], photoStops: number[][] = []): { durations: number[]; timing: FlyoverTiming; totalMs: number } {
  const flown = durations.map((d, i) => d > 0 || (stopCounts[i] ?? 0) > 0);
  const days = flown.filter(Boolean).length;
  const routedDays = durations.filter((d) => d > 0).length;
  const wanted = durations.reduce((a, d) => a + (d > 0 ? d : 0), 0);
  const everyStop = Math.max(0, ...stopCounts);
  // Upper bound on what the 3 s leg minimum adds on top of the day's pace (only the playback-like plan has it).
  const legReserve = durations.reduce((a, d, i) => a + (d > 0 ? Math.max(0, (stopCounts[i] ?? 0) - 1) * LEG_MIN_MS : 0), 0);
  const plan = (perDay: number, introMs: number, stopMs: number, photoMs: number) => {
    const dwells = stopCounts.map((n, i) => {
      if (!flown[i]) return Array(n).fill(0);
      const photos = photoStops[i] ?? [];
      const featured = featuredStops(n, photos, perDay);
      return Array.from({ length: n }, (_, s) => (!featured.has(s) ? 0 : photos.includes(s) ? photoMs : stopMs));
    });
    const fixed = days * introMs + dwells.flat().reduce((a, b) => a + b, 0);
    return { dwells, fixed, introMs, stopMs, legMin: false };
  };
  // A playback-like plan fits only when the route keeps at least `drawShare` of its normal speed.
  const fitsDrawing = (drawShare: number) => (p: { fixed: number }) => p.fixed + wanted * drawShare <= FILM_BUDGET_MS;
  // The quick plans fit when the openings and pauses leave every routed day at least FILM_MIN_DAY_MS to draw.
  const fitsQuick = (p: { fixed: number }) => p.fixed + routedDays * FILM_MIN_DAY_MS <= FILM_BUDGET_MS;
  const steps: [() => ReturnType<typeof plan>, (p: { fixed: number }) => boolean][] = [
    [() => ({ ...plan(everyStop, DAY_INTRO_MS, STOP_DWELL_MS, FILM_PHOTO_HOLD_MS), legMin: true }), (p) => fitsDrawing(1)({ fixed: p.fixed + legReserve })],
    [() => plan(everyStop, 3000, 2000, 3000), fitsDrawing(0.6)],
    [() => plan(FILM_STOPS_PER_DAY, 3000, 2000, 3000), fitsDrawing(0.6)],
    [() => plan(everyStop, 1200, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(FILM_STOPS_PER_DAY, 1200, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(3, 1200, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(2, 1200, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(1, 1200, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(1, 600, FILM_STOP_DWELL_MS, FILM_PHOTO_DWELL_MS), fitsQuick],
    [() => plan(1, 600, 600, 1000), fitsQuick],
  ];
  let chosen: ReturnType<typeof plan> | null = null;
  for (const [make, fits] of steps) {
    const p = make();
    if (fits(p)) { chosen = p; break; }
  }
  // Very long trips (40+ days): no plain pauses, photos 1 s, and openings share what's left of half the budget.
  if (!chosen) {
    const bare = plan(1, 600, 0, 1000);
    const photoMs = bare.fixed - days * 600;
    chosen = plan(1, Math.max(1, Math.floor((FILM_BUDGET_MS / 2 - photoMs) / Math.max(1, days))), 0, 1000);
  }
  const { dwells, fixed, introMs, stopMs, legMin } = chosen;
  const timing: FlyoverTiming = { introMs, dwellMs: stopMs, dwells, legMinMs: legMin ? LEG_MIN_MS : 0 };
  const drawBudget = Math.max(0, FILM_BUDGET_MS - fixed);
  const scale = wanted > 0 ? Math.min(1, drawBudget / wanted) : 0;
  let out = durations.map((d) => (d > 0 ? Math.max(FILM_MIN_DAY_MS, Math.round(d * scale)) : 0));
  // The per-day minimum can push a very long trip over: shrink every routed day evenly to fit.
  const drawn = out.reduce((a, b) => a + b, 0);
  if (drawn > drawBudget && drawn > 0) out = out.map((d) => (d > 0 ? Math.max(1, Math.floor((d * drawBudget) / drawn)) : 0));
  return { durations: out, timing, totalMs: fixed + out.reduce((a, b) => a + b, 0) };
}

/**
 * The camera at a stop, from how long the flyover rests there: a long rest is the playback's close-up — fly in,
 * then a slow circle — and a short one (the squeezed video) a quick move onto it. One rule for playback and video,
 * so a video that has the time looks like the playback.
 */
export function stopShot(holdMs: number): { style: 'closeup'; circleMs: number } | { style: 'quick' } {
  return holdMs >= 1800 ? { style: 'closeup', circleMs: Math.max(600, holdMs - 1300) } : { style: 'quick' };
}

/**
 * A day's opening: the whole route from above, then — when there's time — down to the first stop and a slow circle
 * (the playback's 4 s opening: fly down at 1.5 s, circle at 2.75 s). A short opening is the overview only.
 */
export function introShot(introMs: number): { overviewMs: number; arriveAt?: number; circleAt?: number; circleMs?: number } {
  if (introMs < 3000) return { overviewMs: Math.min(1100, Math.round(introMs * 0.8)) };
  const arriveAt = Math.max(1200, introMs - STOP_DWELL_MS);
  return { overviewMs: 1100, arriveAt, circleAt: arriveAt + 1250, circleMs: Math.max(600, introMs - arriveAt - 1300) };
}

/** How often the follow camera glides: once a second, twice on a squeezed day so it keeps up with the line. */
export function followStepMs(dayMs: number): number {
  return dayMs < 4000 ? 500 : 1000;
}

/** Whether the flyover owns the map: drawing, camera, bottom card. A finished one doesn't. */
export function isFlyoverActive(status: FlyoverStatus): boolean {
  return status === 'playing' || status === 'paused';
}

/** `DAY 2 · SAT, NOV 25 · STOP 3 OF 6` — the flyover card's eyebrow. */
export function stopEyebrow(dayNumber: number, dateLabel: string | null, stopIndex: number, stopCount: number): string {
  return [`DAY ${dayNumber}`, dateLabel, `STOP ${stopIndex + 1} OF ${stopCount}`].filter(Boolean).join(' · ');
}
