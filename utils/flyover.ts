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
export type FlyoverTiming = { introMs: number; dwellMs: number };
export const DEFAULT_TIMING: FlyoverTiming = { introMs: DAY_INTRO_MS, dwellMs: STOP_DWELL_MS };

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
      const progress = Math.min(1, state.progress + dt / duration);
      // The next stop on the line: stop the head there and dwell. One stop per
      // tick, so two stops at the same spot each get their own pause.
      const next = state.stopIndex + 1;
      const at = action.stopFractions[state.dayIndex]?.[next];
      if (at !== undefined && progress >= at) return { ...state, progress: at, stopIndex: next, hold: timing.dwellMs };
      if (progress >= 1) return nextDay(state, action.durations, timing);
      return { ...state, progress, hold: 0 };
    }
  }
}

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
  // Very long trips (40+ days): even 0.6 s openings overflow, so share half the budget between them.
  if (days * timing.introMs > FILM_BUDGET_MS / 2) timing = { introMs: Math.max(1, Math.floor(FILM_BUDGET_MS / 2 / days)), dwellMs: 0 };
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

/** Whether the flyover owns the map: drawing, camera, bottom card. A finished one doesn't. */
export function isFlyoverActive(status: FlyoverStatus): boolean {
  return status === 'playing' || status === 'paused';
}

/** `DAY 2 · SAT, NOV 25 · STOP 3 OF 6` — the flyover card's eyebrow. */
export function stopEyebrow(dayNumber: number, dateLabel: string | null, stopIndex: number, stopCount: number): string {
  return [`DAY ${dayNumber}`, dateLabel, `STOP ${stopIndex + 1} OF ${stopCount}`].filter(Boolean).join(' · ');
}
