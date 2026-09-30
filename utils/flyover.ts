/**
 * The trip map's day-by-day flyover as a pure state machine. The component
 * dispatches `tick` from requestAnimationFrame; everything about pacing,
 * rolling into the next day and finishing is decided here, where it's tested.
 */
export type FlyoverStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface FlyoverState {
  status: FlyoverStatus;
  dayIndex: number;
  /** 0 → 1 along the current day's path. */
  progress: number;
  /** Milliseconds still to wait at the start of a day before drawing — the
   *  camera settles on the first stop and its tiles load. */
  hold: number;
}

export type FlyoverAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[] }
  | { type: 'jump'; dayIndex: number }
  | { type: 'stop' };

/** Pause at the start of each day. Without it the camera arrived moving and the map never caught up. */
export const DAY_HOLD_MS = 1500;

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0, hold: 0 };

const startOfDay = (dayIndex: number): FlyoverState => ({ status: 'playing', dayIndex, progress: 0, hold: DAY_HOLD_MS });

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
      let dt = action.dt;
      let hold = state.hold;
      if (duration > 0 && hold > 0) {
        const spent = Math.min(hold, dt);
        hold -= spent;
        dt -= spent;
        if (dt <= 0) return { ...state, hold };
      }
      const progress = duration <= 0 ? 1 : state.progress + dt / duration;
      if (progress < 1) return { ...state, progress, hold };
      const last = action.durations.length - 1;
      if (state.dayIndex >= last) return { status: 'done', dayIndex: state.dayIndex, progress: 1, hold: 0 };
      return startOfDay(state.dayIndex + 1);
    }
  }
}

/** Whether the flyover owns the map: drawing, camera, bottom card. A finished one doesn't. */
export function isFlyoverActive(status: FlyoverStatus): boolean {
  return status === 'playing' || status === 'paused';
}
