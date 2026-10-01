import {
  flyoverReducer, dayDurationMs, initialFlyover, isFlyoverActive, STOP_DWELL_MS, stopEyebrow,
  type FlyoverState, type FlyoverAction,
} from '@/utils/flyover';

const durations = [6000, 9000];
const playing = (dayIndex: number, progress: number, hold = 0) => ({ status: 'playing' as const, dayIndex, progress, hold, stopIndex: 0 });

describe('dayDurationMs', () => {
  it('scales with distance between 6 and 18 seconds', () => {
    expect(dayDurationMs(0)).toBe(6000);
    expect(dayDurationMs(30_000)).toBeGreaterThan(6000);
    expect(dayDurationMs(10_000_000)).toBe(18000);
  });
});

describe('flyoverReducer', () => {
  it('plays from the first day, holding on it while the camera settles', () => {
    expect(flyoverReducer(initialFlyover, { type: 'play' })).toEqual(playing(0, 0, STOP_DWELL_MS));
  });

  it('spends the hold before moving the drawing head', () => {
    const s = flyoverReducer(playing(0, 0, 1000), { type: 'tick', dt: 400, durations, stopFractions: [] });
    expect(s).toEqual(playing(0, 0, 600));
  });

  it('carries time left over after the hold into progress', () => {
    const s = flyoverReducer(playing(0, 0, 300), { type: 'tick', dt: 900, durations, stopFractions: [] });
    expect(s.hold).toBe(0);
    expect(s.progress).toBeCloseTo(600 / 6000);
  });

  it('advances progress by elapsed time over the day’s duration', () => {
    const s = flyoverReducer(playing(0, 0), { type: 'tick', dt: 1500, durations, stopFractions: [] });
    expect(s.progress).toBeCloseTo(0.25);
  });

  it('rolls into the next day with a fresh hold, and finishes after the last', () => {
    expect(flyoverReducer(playing(0, 0.9), { type: 'tick', dt: 1000, durations, stopFractions: [] })).toEqual(playing(1, 0, STOP_DWELL_MS));
    expect(flyoverReducer(playing(1, 0.95), { type: 'tick', dt: 1000, durations, stopFractions: [] }))
      .toEqual({ status: 'done', dayIndex: 1, progress: 1, hold: 0, stopIndex: 0 });
  });

  it('ignores ticks while paused, and resumes where it stopped', () => {
    const paused = { status: 'paused' as const, dayIndex: 1, progress: 0.5, hold: 0, stopIndex: 0 };
    expect(flyoverReducer(paused, { type: 'tick', dt: 1000, durations, stopFractions: [] })).toBe(paused);
    expect(flyoverReducer(paused, { type: 'play' })).toEqual(playing(1, 0.5));
  });

  it('restarts from day one after finishing', () => {
    expect(flyoverReducer({ status: 'done', dayIndex: 1, progress: 1, hold: 0, stopIndex: 0 }, { type: 'play' })).toEqual(playing(0, 0, STOP_DWELL_MS));
  });

  it('jumps to a day at its start, and stops back to idle', () => {
    expect(flyoverReducer(playing(0, 0.3), { type: 'jump', dayIndex: 1 })).toEqual(playing(1, 0, STOP_DWELL_MS));
    expect(flyoverReducer(playing(1, 0.3), { type: 'stop' })).toEqual(initialFlyover);
  });

  it('skips a day with no route instead of stalling', () => {
    const s = flyoverReducer(playing(0, 0), { type: 'tick', dt: 16, durations: [0, 6000], stopFractions: [] });
    expect(s.dayIndex).toBe(1);
  });
});

describe('isFlyoverActive', () => {
  it('is only playing or paused — a finished flyover hands the map back', () => {
    expect(isFlyoverActive('playing')).toBe(true);
    expect(isFlyoverActive('paused')).toBe(true);
    expect(isFlyoverActive('done')).toBe(false);
    expect(isFlyoverActive('idle')).toBe(false);
  });
});

const run = (s: FlyoverState, ...actions: FlyoverAction[]) => actions.reduce(flyoverReducer, s);
const tick = (dt: number, durations: number[], stopFractions: number[][]): FlyoverAction => ({ type: 'tick', dt, durations, stopFractions });

describe('flyover stop pauses', () => {
  const D = [10_000], F = [[0, 0.5, 1]];

  it('shows the first stop while the day starts', () => {
    const s = run(initialFlyover, { type: 'play' });
    expect(s).toMatchObject({ status: 'playing', dayIndex: 0, stopIndex: 0, hold: STOP_DWELL_MS, progress: 0 });
  });

  it('stops the drawing head at each stop and dwells there', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, D, F));
    expect(s).toMatchObject({ hold: 0, stopIndex: 0 });
    s = run(s, tick(6_000, D, F)); // would reach 0.6 — clamps to the stop at 0.5
    expect(s).toMatchObject({ progress: 0.5, stopIndex: 1, hold: STOP_DWELL_MS });
    s = run(s, tick(1_000, D, F));
    expect(s).toMatchObject({ progress: 0.5, stopIndex: 1, hold: STOP_DWELL_MS - 1_000 });
    s = run(s, tick(1_500, D, F), tick(6_000, D, F));
    expect(s).toMatchObject({ progress: 1, stopIndex: 2, hold: STOP_DWELL_MS });
    s = run(s, tick(STOP_DWELL_MS, D, F), tick(33, D, F));
    expect(s.status).toBe('done');
  });

  it('pauses separately at two stops in the same spot', () => {
    const F2 = [[0, 0.5, 0.5, 1]];
    let s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, D, F2), tick(6_000, D, F2));
    expect(s).toMatchObject({ stopIndex: 1, hold: STOP_DWELL_MS });
    s = run(s, tick(STOP_DWELL_MS, D, F2), tick(33, D, F2));
    expect(s).toMatchObject({ stopIndex: 2, progress: 0.5, hold: STOP_DWELL_MS });
  });

  it('rolls into the next day after the last stop, starting on its first stop', () => {
    const DD = [10_000, 10_000], FF = [[0, 1], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 1, stopIndex: 0, progress: 0, hold: STOP_DWELL_MS });
  });

  it('skips a day with no path without dwelling', () => {
    const DD = [10_000, 0, 10_000], FF = [[0, 1], [0], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(STOP_DWELL_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 2, stopIndex: 0, hold: STOP_DWELL_MS });
  });

  it('keeps the dwell while paused, and a jump starts the day on its first stop', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(1_000, D, F), { type: 'pause' }, tick(5_000, D, F));
    expect(s).toMatchObject({ status: 'paused', hold: STOP_DWELL_MS - 1_000 });
    s = run(s, { type: 'jump', dayIndex: 0 });
    expect(s).toMatchObject({ status: 'playing', stopIndex: 0, hold: STOP_DWELL_MS, progress: 0 });
  });
});

describe('stopEyebrow', () => {
  it('reads day, date and stop', () => {
    expect(stopEyebrow(2, 'SAT, NOV 25', 2, 6)).toBe('DAY 2 · SAT, NOV 25 · STOP 3 OF 6');
    expect(stopEyebrow(1, null, 0, 1)).toBe('DAY 1 · STOP 1 OF 1');
  });
});
