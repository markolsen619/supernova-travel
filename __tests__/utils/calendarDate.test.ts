// A check-in date is a calendar date, not an instant: "15 October" is the
// same day in Lisbon and in San Diego. Storing or rendering it as a moment in
// time makes it slide across midnight, which is the bug these tests pin.
//
// The timezone is fixed to a UTC- zone on purpose. In UTC+ zones a broken
// implementation happens to produce the right answer, so without this the
// suite would pass on a machine in Tokyo and fail in California. Set before
// importing anything that touches Date.
process.env.TZ = 'America/Los_Angeles';

import {
  toCalendarDate,
  parseCalendarDate,
  formatCalendarDate,
} from '@/utils/calendarDate';

const SHORT = { month: 'short', day: 'numeric', year: 'numeric' } as const;

describe('formatCalendarDate', () => {
  it('renders a date-only string as that calendar date, not shifted by timezone', () => {
    // new Date('2026-10-15') parses as UTC midnight, which is 14 Oct 17:00
    // local — the exact off-by-one this helper exists to prevent.
    expect(formatCalendarDate('2026-10-15', SHORT)).toBe('Oct 15, 2026');
  });

  it('reads a legacy UTC-midnight instant as its UTC calendar date', () => {
    // What parseTravelConfirmation used to ask Gemini for.
    expect(formatCalendarDate('2026-08-15T00:00:00.000Z', SHORT)).toBe('Aug 15, 2026');
  });

  it('reads a legacy local-midnight instant as the day its author picked', () => {
    // What the add form used to write: 15 Oct 00:00 PDT -> 07:00Z.
    expect(formatCalendarDate('2026-10-15T07:00:00.000Z', SHORT)).toBe('Oct 15, 2026');
  });

  it("honours the caller's own format options", () => {
    expect(
      formatCalendarDate('2026-10-15', { weekday: 'short', month: 'long', day: 'numeric' }),
    ).toBe('Thu, October 15');
  });

  it('returns the raw value unchanged when it cannot be parsed', () => {
    expect(formatCalendarDate('not a date', SHORT)).toBe('not a date');
    expect(formatCalendarDate('', SHORT)).toBe('');
  });
});

describe('toCalendarDate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 15 Oct 23:30 local is already 16 Oct in UTC, so a naive
    // toISOString().slice(0, 10) would record the wrong day.
    expect(toCalendarDate(new Date(2026, 9, 15, 23, 30))).toBe('2026-10-15');
  });

  it('zero-pads month and day', () => {
    expect(toCalendarDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});

describe('parseCalendarDate', () => {
  it('returns local midnight on the given day', () => {
    const d = parseCalendarDate('2026-10-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(9);
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(0);
  });

  it('accepts a legacy instant and returns the calendar day it stood for', () => {
    const d = parseCalendarDate('2026-08-15T00:00:00.000Z');
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(15);
  });

  it('returns null for input it cannot read', () => {
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('nope')).toBeNull();
  });

  it('round-trips through toCalendarDate', () => {
    const key = '2026-03-01';
    expect(toCalendarDate(parseCalendarDate(key)!)).toBe(key);
  });
});
