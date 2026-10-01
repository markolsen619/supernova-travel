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
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[]; stopFractions: number[][] }
  | { type: 'jump'; dayIndex: number }
  | { type: 'stop' };

/**
 * How long the flyover rests on each stop — the camera settles on it and the
 * card shows it — before drawing on to the next. The first stop of a day gets
 * the same rest, which also gives the map time to load its tiles.
 */
export const STOP_DWELL_MS = 2500;

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0, hold: 0, stopIndex: -1 };

const startOfDay = (dayIndex: number): FlyoverState => ({ status: 'playing', dayIndex, progress: 0, hold: STOP_DWELL_MS, stopIndex: 0 });

function nextDay(state: FlyoverState, durations: number[]): FlyoverState {
  if (state.dayIndex >= durations.length - 1) return { ...state, status: 'done', progress: 1, hold: 0 };
  return startOfDay(state.dayIndex + 1);
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
      if (state.status === 'done' || state.status === 'idle') return startOfDay(0);
      return { ...state, status: 'playing' };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'stop':
      return initialFlyover;
    case 'jump':
      return startOfDay(action.dayIndex);
    case 'tick': {
      if (state.status !== 'playing') return state;
      const duration = action.durations[state.dayIndex] ?? 0;
      // A day with no path: nothing to draw or show.
      if (duration <= 0) return nextDay(state, action.durations);
      let dt = action.dt;
      if (state.hold > 0) {
        const hold = state.hold - Math.min(state.hold, dt);
        dt -= state.hold - hold;
        if (hold > 0 || dt <= 0) return { ...state, hold };
      }
      if (state.progress >= 1) return nextDay(state, action.durations);
      const progress = Math.min(1, state.progress + dt / duration);
      // The next stop on the line: stop the head there and dwell. One stop per
      // tick, so two stops at the same spot each get their own pause.
      const next = state.stopIndex + 1;
      const at = action.stopFractions[state.dayIndex]?.[next];
      if (at !== undefined && progress >= at) return { ...state, progress: at, stopIndex: next, hold: STOP_DWELL_MS };
      if (progress >= 1) return nextDay(state, action.durations);
      return { ...state, progress, hold: 0 };
    }
  }
}

/** Whether the flyover owns the map: drawing, camera, bottom card. A finished one doesn't. */
export function isFlyoverActive(status: FlyoverStatus): boolean {
  return status === 'playing' || status === 'paused';
}

/** `DAY 2 · SAT, NOV 25 · STOP 3 OF 6` — the flyover card's eyebrow. */
export function stopEyebrow(dayNumber: number, dateLabel: string | null, stopIndex: number, stopCount: number): string {
  return [`DAY ${dayNumber}`, dateLabel, `STOP ${stopIndex + 1} OF ${stopCount}`].filter(Boolean).join(' · ');
}
