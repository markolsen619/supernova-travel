import {
  flyoverReducer, dayDurationMs, initialFlyover, isFlyoverActive, STOP_DWELL_MS, DAY_INTRO_MS, stopEyebrow,
  filmTiming, DEFAULT_TIMING, FILM_BUDGET_MS,
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
    expect(flyoverReducer(initialFlyover, { type: 'play' })).toEqual(playing(0, 0, DAY_INTRO_MS));
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
    expect(flyoverReducer(playing(0, 0.9), { type: 'tick', dt: 1000, durations, stopFractions: [] })).toEqual(playing(1, 0, DAY_INTRO_MS));
    expect(flyoverReducer(playing(1, 0.95), { type: 'tick', dt: 1000, durations, stopFractions: [] }))
      .toEqual({ status: 'done', dayIndex: 1, progress: 1, hold: 0, stopIndex: 0 });
  });

  it('ignores ticks while paused, and resumes where it stopped', () => {
    const paused = { status: 'paused' as const, dayIndex: 1, progress: 0.5, hold: 0, stopIndex: 0 };
    expect(flyoverReducer(paused, { type: 'tick', dt: 1000, durations, stopFractions: [] })).toBe(paused);
    expect(flyoverReducer(paused, { type: 'play' })).toEqual(playing(1, 0.5));
  });

  it('restarts from day one after finishing', () => {
    expect(flyoverReducer({ status: 'done', dayIndex: 1, progress: 1, hold: 0, stopIndex: 0 }, { type: 'play' })).toEqual(playing(0, 0, DAY_INTRO_MS));
  });

  it('jumps to a day at its start, and stops back to idle', () => {
    expect(flyoverReducer(playing(0, 0.3), { type: 'jump', dayIndex: 1 })).toEqual(playing(1, 0, DAY_INTRO_MS));
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
    expect(s).toMatchObject({ status: 'playing', dayIndex: 0, stopIndex: 0, hold: DAY_INTRO_MS, progress: 0 });
  });

  it('stops the drawing head at each stop and dwells there', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(DAY_INTRO_MS, D, F));
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
    let s = run(initialFlyover, { type: 'play' }, tick(DAY_INTRO_MS, D, F2), tick(6_000, D, F2));
    expect(s).toMatchObject({ stopIndex: 1, hold: STOP_DWELL_MS });
    s = run(s, tick(STOP_DWELL_MS, D, F2), tick(33, D, F2));
    expect(s).toMatchObject({ stopIndex: 2, progress: 0.5, hold: STOP_DWELL_MS });
  });

  it('rolls into the next day after the last stop, starting on its first stop', () => {
    const DD = [10_000, 10_000], FF = [[0, 1], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(DAY_INTRO_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 1, stopIndex: 0, progress: 0, hold: DAY_INTRO_MS });
  });

  it('skips a day with no stops without dwelling', () => {
    const DD = [10_000, 0, 10_000], FF = [[0, 1], [], [0, 1]];
    const s = run(initialFlyover, { type: 'play' }, tick(DAY_INTRO_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 2, stopIndex: 0, hold: DAY_INTRO_MS });
  });

  it('keeps the dwell while paused, and a jump starts the day on its first stop', () => {
    let s = run(initialFlyover, { type: 'play' }, tick(1_000, D, F), { type: 'pause' }, tick(5_000, D, F));
    expect(s).toMatchObject({ status: 'paused', hold: DAY_INTRO_MS - 1_000 });
    s = run(s, { type: 'jump', dayIndex: 0 });
    expect(s).toMatchObject({ status: 'playing', stopIndex: 0, hold: DAY_INTRO_MS, progress: 0 });
  });
});

describe('one-stop days', () => {
  it('still rests on a day with a single stop (no route to draw), then moves on', () => {
    const DD = [10_000, 0, 10_000], FF = [[0, 1], [0], [0, 1]];
    let s = run(initialFlyover, { type: 'play' }, tick(DAY_INTRO_MS, DD, FF), tick(10_000, DD, FF), tick(STOP_DWELL_MS, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 1, stopIndex: 0, hold: DAY_INTRO_MS });
    s = run(s, tick(1_000, DD, FF));
    expect(s).toMatchObject({ dayIndex: 1, hold: DAY_INTRO_MS - 1_000 });
    s = run(s, tick(DAY_INTRO_MS - 1_000, DD, FF), tick(33, DD, FF));
    expect(s).toMatchObject({ dayIndex: 2, stopIndex: 0, hold: DAY_INTRO_MS });
  });
});

describe('stopEyebrow', () => {
  it('reads day, date and stop', () => {
    expect(stopEyebrow(2, 'SAT, NOV 25', 2, 6)).toBe('DAY 2 · SAT, NOV 25 · STOP 3 OF 6');
    expect(stopEyebrow(1, null, 0, 1)).toBe('DAY 1 · STOP 1 OF 1');
  });
});

describe('day intro', () => {
  it('each day opens on its overview for longer than a stop rests', () => {
    expect(DAY_INTRO_MS).toBeGreaterThan(STOP_DWELL_MS);
  });
});


describe('filmTiming (trip video, up to ~60 s — owner 2026-10-25)', () => {
  const trip = (days: number, ms = 12000, stops = 5) => ({ durations: Array(days).fill(ms), stopCounts: Array(days).fill(stops) });
  it.each([1, 3, 7, 14, 21])('a %i-day trip fits the budget', (n) => {
    const { durations, stopCounts } = trip(n);
    const f = filmTiming(durations, stopCounts);
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
    expect(f.durations.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
  });
  it('the budget is about a minute', () => {
    expect(FILM_BUDGET_MS).toBe(54000);
  });
  it('a short trip stops at every stop for a real pause', () => {
    const f = filmTiming([9000, 9000], [3, 3]);
    expect(f.timing.dwells).toEqual([[1000, 1000, 1000], [1000, 1000, 1000]]);
  });
  it('the Tokyo trip (8 days, 4 stops a day) stops at every stop', () => {
    const f = filmTiming(Array(8).fill(14000), Array(8).fill(4));
    expect(f.timing.dwells!.flat().every((d) => d >= 1000)).toBe(true);
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
  });
  it('a trip that fits pauses at every stop, however many a day has (London, 6 stops in a day — owner 2026-10-25)', () => {
    expect(filmTiming([12000], [6]).timing.dwells).toEqual([[1000, 1000, 1000, 1000, 1000, 1000]]);
    expect(filmTiming([12000], [9]).timing.dwells![0].every((d) => d === 1000)).toBe(true);
  });
  it('on a trip too long for every stop, a busy day features at most 4: first, last and spread between', () => {
    const f = filmTiming(Array(7).fill(12000), Array(7).fill(9));
    for (const day of f.timing.dwells!) expect(day.flatMap((d, i) => (d > 0 ? [i] : []))).toEqual([0, 3, 5, 8]);
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
  });
  it('a long trip features fewer stops per day, but every day keeps at least one real stop', () => {
    const f = filmTiming(Array(21).fill(12000), Array(21).fill(6));
    const perDay = f.timing.dwells!.map((d) => d.filter((x) => x > 0).length);
    expect(Math.max(...perDay)).toBeLessThan(4);
    expect(perDay.every((n) => n >= 1)).toBe(true);
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
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

describe('filmTiming — very long trips (final review)', () => {
  it.each([45, 60, 90])('a %i-day trip still fits the budget', (n) => {
    const f = filmTiming(Array(n).fill(12000), Array(n).fill(6));
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
    expect(f.timing.introMs).toBeGreaterThan(0);
    expect(f.durations.every((d) => d > 0)).toBe(true);
  });
});

describe('filmTiming — photo stops', () => {
  it('a photo stop rests longer and is always featured', () => {
    const f = filmTiming([9000, 9000], [3, 3], [[1], []]);
    expect(f.timing.dwells?.[0]).toEqual([1000, 1500, 1000]);
  });
  it('photo stops are featured first on a busy day', () => {
    const f = filmTiming(Array(7).fill(12000), Array(7).fill(9), [[4]]);
    expect(f.timing.dwells![0][4]).toBe(1500);
    expect(f.timing.dwells![0].filter((x) => x > 0).length).toBeLessThanOrEqual(4);
  });
  it('with photos the film still fits the budget', () => {
    const f = filmTiming(Array(7).fill(12000), Array(7).fill(5), Array.from({ length: 7 }, () => [0]));
    expect(f.totalMs).toBeLessThanOrEqual(FILM_BUDGET_MS);
  });
  it('the reducer rests on a photo stop for its own pause', () => {
    const playing = { status: 'playing' as const, dayIndex: 0, progress: 0.4, hold: 0, stopIndex: 0 };
    const s = flyoverReducer(playing, { type: 'tick', dt: 100, durations: [1000], stopFractions: [[0, 0.45]], timing: { introMs: 1200, dwellMs: 600, dwells: [[600, 1500]] } });
    expect(s.hold).toBe(1500);
  });
});
