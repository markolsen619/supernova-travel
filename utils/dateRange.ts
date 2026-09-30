/**
 * Pure logic behind the trip date-range calendar (components/ui/DateRangeSheet).
 *
 * Every Date here is a local calendar day at midnight. A trip's dates are days
 * on a wall calendar, not instants, so all arithmetic goes through calendar
 * components rather than milliseconds — a range that spans a daylight-saving
 * change is 23 or 25 hours short of a whole number of days.
 */

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface SelectableOptions {
  /** Earliest tappable day. */
  minDate?: Date | null;
  /** Longest trip allowed, counting both ends (a 14-day cap allows the 1st–14th). */
  maxDays?: number | null;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Whole calendar days from a to b (negative when b is earlier). */
function calendarDaysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Days in the trip, counting both the first and the last. */
export function tripDayCount(start: Date, end: Date): number {
  return calendarDaysBetween(start, end) + 1;
}

/**
 * One month as Sunday-first weeks. Days outside the month are null so every
 * week has exactly seven cells and the grid never shifts between months.
 * `month` is 0-based, like Date.
 */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const leading = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = Array(leading).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * The range after tapping `day`. First tap starts a range, a later second tap
 * closes it, tapping the start again makes a one-day trip, and an earlier
 * second tap restarts from there rather than producing a backwards range.
 */
export function selectDay(range: DateRange, day: Date): DateRange {
  const tapped = startOfDay(day);
  if (!range.start || range.end) return { start: tapped, end: null };
  if (calendarDaysBetween(range.start, tapped) < 0) return { start: tapped, end: null };
  return { start: range.start, end: tapped };
}

export function isDaySelectable(day: Date, range: DateRange, opts: SelectableOptions = {}): boolean {
  if (opts.minDate && calendarDaysBetween(startOfDay(opts.minDate), day) < 0) return false;

  // The length cap only applies while an end is being chosen. Days before the
  // start stay tappable because they restart the range.
  if (opts.maxDays && range.start && !range.end) {
    const offset = calendarDaysBetween(range.start, day);
    if (offset >= 0 && offset + 1 > opts.maxDays) return false;
  }
  return true;
}

export function isWithinRange(day: Date, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  return calendarDaysBetween(range.start, day) >= 0 && calendarDaysBetween(day, range.end) >= 0;
}

/** "1 day", "6 days". */
export function dayCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/** "Jul 25 – 30 · 6 days", widening to months and years only when they differ. */
export function formatRangeLabel(start: Date, end: Date): string {
  const count = dayCountLabel(tripDayCount(start, end));
  const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (isSameDay(start, end)) return `${monthDay(start)} · ${count}`;

  if (start.getFullYear() !== end.getFullYear()) {
    const full = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${full(start)} – ${full(end)} · ${count}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${monthDay(start)} – ${monthDay(end)} · ${count}`;
  }
  return `${monthDay(start)} – ${end.getDate()} · ${count}`;
}
