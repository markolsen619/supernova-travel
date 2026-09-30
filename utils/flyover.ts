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
}

export type FlyoverAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; durations: number[] }
  | { type: 'jump'; dayIndex: number }
  | { type: 'stop' };

export const initialFlyover: FlyoverState = { status: 'idle', dayIndex: 0, progress: 0 };

/** 4 s for a walkable day up to 12 s for a long drive — long enough to follow, short enough to finish. */
export function dayDurationMs(meters: number): number {
  return Math.round(Math.min(12_000, 4_000 + meters / 25));
}

export function flyoverReducer(state: FlyoverState, action: FlyoverAction): FlyoverState {
  switch (action.type) {
    case 'play':
      if (state.status === 'done' || state.status === 'idle') return { status: 'playing', dayIndex: 0, progress: 0 };
      return { ...state, status: 'playing' };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'stop':
      return initialFlyover;
    case 'jump':
      return { status: state.status === 'idle' || state.status === 'done' ? 'playing' : state.status, dayIndex: action.dayIndex, progress: 0 };
    case 'tick': {
      if (state.status !== 'playing') return state;
      const duration = action.durations[state.dayIndex] ?? 0;
      const progress = duration <= 0 ? 1 : state.progress + action.dt / duration;
      if (progress < 1) return { ...state, progress };
      const last = action.durations.length - 1;
      if (state.dayIndex >= last) return { status: 'done', dayIndex: state.dayIndex, progress: 1 };
      return { status: 'playing', dayIndex: state.dayIndex + 1, progress: 0 };
    }
  }
}
