import {
  monthGrid,
  selectDay,
  isDaySelectable,
  tripDayCount,
  formatRangeLabel,
  startOfDay,
} from '@/utils/dateRange';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('monthGrid', () => {
  it('pads to a Sunday-first week and fills whole weeks', () => {
    // September 2026 starts on a Tuesday.
    const weeks = monthGrid(2026, 8);
    expect(weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(weeks[0][2]).toEqual(d(2026, 9, 1));
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(days[29]).toEqual(d(2026, 9, 30));
  });
});

describe('selectDay', () => {
  it('starts a range on the first tap', () => {
    expect(selectDay({ start: null, end: null }, d(2026, 7, 25))).toEqual({ start: d(2026, 7, 25), end: null });
  });

  it('closes the range on a later second tap', () => {
    expect(selectDay({ start: d(2026, 7, 25), end: null }, d(2026, 7, 30))).toEqual({
      start: d(2026, 7, 25),
      end: d(2026, 7, 30),
    });
  });

  it('treats tapping the start again as a one-day trip', () => {
    expect(selectDay({ start: d(2026, 7, 25), end: null }, d(2026, 7, 25))).toEqual({
      start: d(2026, 7, 25),
      end: d(2026, 7, 25),
    });
  });

  it('restarts from an earlier day rather than making a backwards range', () => {
    expect(selectDay({ start: d(2026, 7, 25), end: null }, d(2026, 7, 20))).toEqual({ start: d(2026, 7, 20), end: null });
  });

  it('starts over once a range is complete', () => {
    expect(selectDay({ start: d(2026, 7, 25), end: d(2026, 7, 30) }, d(2026, 8, 3))).toEqual({ start: d(2026, 8, 3), end: null });
  });
});

describe('isDaySelectable', () => {
  it('blocks days before the minimum', () => {
    expect(isDaySelectable(d(2026, 9, 28), { start: null, end: null }, { minDate: d(2026, 9, 29) })).toBe(false);
    expect(isDaySelectable(d(2026, 9, 29), { start: null, end: null }, { minDate: d(2026, 9, 29) })).toBe(true);
  });

  it('while picking an end, blocks days that would exceed the maximum length', () => {
    const range = { start: d(2026, 7, 1), end: null };
    expect(isDaySelectable(d(2026, 7, 14), range, { maxDays: 14 })).toBe(true);
    expect(isDaySelectable(d(2026, 7, 15), range, { maxDays: 14 })).toBe(false);
    // Earlier days stay tappable — they restart the range.
    expect(isDaySelectable(d(2026, 6, 20), range, { maxDays: 14 })).toBe(true);
  });

  it('does not cap length once the range is complete', () => {
    const range = { start: d(2026, 7, 1), end: d(2026, 7, 3) };
    expect(isDaySelectable(d(2026, 9, 1), range, { maxDays: 14 })).toBe(true);
  });
});

describe('tripDayCount', () => {
  it('counts both ends', () => {
    expect(tripDayCount(d(2026, 7, 25), d(2026, 7, 30))).toBe(6);
    expect(tripDayCount(d(2026, 7, 25), d(2026, 7, 25))).toBe(1);
  });

  it('is not thrown off by a daylight-saving change inside the range', () => {
    // US clocks go back on 2026-11-01.
    expect(tripDayCount(d(2026, 10, 30), d(2026, 11, 3))).toBe(5);
  });
});

describe('formatRangeLabel', () => {
  it('collapses a same-month range', () => {
    expect(formatRangeLabel(d(2026, 7, 25), d(2026, 7, 30))).toBe('Jul 25 – 30 · 6 days');
  });

  it('names both months when the range crosses one', () => {
    expect(formatRangeLabel(d(2026, 7, 30), d(2026, 8, 2))).toBe('Jul 30 – Aug 2 · 4 days');
  });

  it('names both years when the range crosses one', () => {
    expect(formatRangeLabel(d(2026, 12, 30), d(2027, 1, 2))).toBe('Dec 30, 2026 – Jan 2, 2027 · 4 days');
  });

  it('says one day for a single-day trip', () => {
    expect(formatRangeLabel(d(2026, 7, 25), d(2026, 7, 25))).toBe('Jul 25 · 1 day');
  });
});

describe('startOfDay', () => {
  it('drops the time', () => {
    expect(startOfDay(new Date(2026, 6, 25, 17, 45))).toEqual(d(2026, 7, 25));
  });
});
