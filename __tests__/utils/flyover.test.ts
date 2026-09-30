import { flyoverReducer, dayDurationMs, initialFlyover, isFlyoverActive } from '@/utils/flyover';

const durations = [4000, 6000];

describe('dayDurationMs', () => {
  it('scales with distance between 4 and 12 seconds', () => {
    expect(dayDurationMs(0)).toBe(4000);
    expect(dayDurationMs(10_000)).toBeGreaterThan(4000);
    expect(dayDurationMs(10_000_000)).toBe(12000);
  });
});

describe('flyoverReducer', () => {
  it('plays from the first day', () => {
    expect(flyoverReducer(initialFlyover, { type: 'play' })).toEqual({ status: 'playing', dayIndex: 0, progress: 0 });
  });

  it('advances progress by elapsed time over the day’s duration', () => {
    const s = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0 }, { type: 'tick', dt: 1000, durations });
    expect(s.progress).toBeCloseTo(0.25);
  });

  it('rolls into the next day, and finishes after the last', () => {
    const next = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0.9 }, { type: 'tick', dt: 1000, durations });
    expect(next).toEqual({ status: 'playing', dayIndex: 1, progress: 0 });
    const done = flyoverReducer({ status: 'playing', dayIndex: 1, progress: 0.95 }, { type: 'tick', dt: 1000, durations });
    expect(done).toEqual({ status: 'done', dayIndex: 1, progress: 1 });
  });

  it('ignores ticks while paused, and resumes where it stopped', () => {
    const paused = { status: 'paused' as const, dayIndex: 1, progress: 0.5 };
    expect(flyoverReducer(paused, { type: 'tick', dt: 1000, durations })).toBe(paused);
    expect(flyoverReducer(paused, { type: 'play' })).toEqual({ status: 'playing', dayIndex: 1, progress: 0.5 });
  });

  it('restarts from day one after finishing', () => {
    expect(flyoverReducer({ status: 'done', dayIndex: 1, progress: 1 }, { type: 'play' }))
      .toEqual({ status: 'playing', dayIndex: 0, progress: 0 });
  });

  it('jumps to a day at its start, and stops back to idle', () => {
    expect(flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0.3 }, { type: 'jump', dayIndex: 1 }))
      .toEqual({ status: 'playing', dayIndex: 1, progress: 0 });
    expect(flyoverReducer({ status: 'playing', dayIndex: 1, progress: 0.3 }, { type: 'stop' })).toEqual(initialFlyover);
  });

  it('skips a day with no route instead of stalling', () => {
    const s = flyoverReducer({ status: 'playing', dayIndex: 0, progress: 0 }, { type: 'tick', dt: 16, durations: [0, 6000] });
    expect(s.dayIndex).toBe(1);
  });
});

describe('isFlyoverActive', () => {
  it('is only playing or paused — a finished flyover hands the map back', () => {
    // 'done' counted as flying: tapping a stop afterwards showed no card and
    // every stop stayed mounted as a native marker.
    expect(isFlyoverActive('playing')).toBe(true);
    expect(isFlyoverActive('paused')).toBe(true);
    expect(isFlyoverActive('done')).toBe(false);
    expect(isFlyoverActive('idle')).toBe(false);
  });
});
