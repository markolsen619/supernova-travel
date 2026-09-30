import { flyoverReducer, dayDurationMs, initialFlyover, isFlyoverActive, DAY_HOLD_MS } from '@/utils/flyover';

const durations = [6000, 9000];
const playing = (dayIndex: number, progress: number, hold = 0) => ({ status: 'playing' as const, dayIndex, progress, hold });

describe('dayDurationMs', () => {
  it('scales with distance between 6 and 18 seconds', () => {
    expect(dayDurationMs(0)).toBe(6000);
    expect(dayDurationMs(30_000)).toBeGreaterThan(6000);
    expect(dayDurationMs(10_000_000)).toBe(18000);
  });
});

describe('flyoverReducer', () => {
  it('plays from the first day, holding on it while the camera settles', () => {
    expect(flyoverReducer(initialFlyover, { type: 'play' })).toEqual(playing(0, 0, DAY_HOLD_MS));
  });

  it('spends the hold before moving the drawing head', () => {
    const s = flyoverReducer(playing(0, 0, 1000), { type: 'tick', dt: 400, durations });
    expect(s).toEqual(playing(0, 0, 600));
  });

  it('carries time left over after the hold into progress', () => {
    const s = flyoverReducer(playing(0, 0, 300), { type: 'tick', dt: 900, durations });
    expect(s.hold).toBe(0);
    expect(s.progress).toBeCloseTo(600 / 6000);
  });

  it('advances progress by elapsed time over the day’s duration', () => {
    const s = flyoverReducer(playing(0, 0), { type: 'tick', dt: 1500, durations });
    expect(s.progress).toBeCloseTo(0.25);
  });

  it('rolls into the next day with a fresh hold, and finishes after the last', () => {
    expect(flyoverReducer(playing(0, 0.9), { type: 'tick', dt: 1000, durations })).toEqual(playing(1, 0, DAY_HOLD_MS));
    expect(flyoverReducer(playing(1, 0.95), { type: 'tick', dt: 1000, durations }))
      .toEqual({ status: 'done', dayIndex: 1, progress: 1, hold: 0 });
  });

  it('ignores ticks while paused, and resumes where it stopped', () => {
    const paused = { status: 'paused' as const, dayIndex: 1, progress: 0.5, hold: 0 };
    expect(flyoverReducer(paused, { type: 'tick', dt: 1000, durations })).toBe(paused);
    expect(flyoverReducer(paused, { type: 'play' })).toEqual(playing(1, 0.5));
  });

  it('restarts from day one after finishing', () => {
    expect(flyoverReducer({ status: 'done', dayIndex: 1, progress: 1, hold: 0 }, { type: 'play' })).toEqual(playing(0, 0, DAY_HOLD_MS));
  });

  it('jumps to a day at its start, and stops back to idle', () => {
    expect(flyoverReducer(playing(0, 0.3), { type: 'jump', dayIndex: 1 })).toEqual(playing(1, 0, DAY_HOLD_MS));
    expect(flyoverReducer(playing(1, 0.3), { type: 'stop' })).toEqual(initialFlyover);
  });

  it('skips a day with no route instead of stalling', () => {
    const s = flyoverReducer(playing(0, 0), { type: 'tick', dt: 16, durations: [0, 6000] });
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
