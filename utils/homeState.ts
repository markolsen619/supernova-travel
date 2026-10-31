/**
 * Which of your trips Home shows (spec docs/superpowers/specs/2026-10-29-home-landing-design.md): today's trip,
 * the next one, the rest coming up (soonest first, undated last), and whether Get inspired fills the screen.
 */
import { toCalendarDate } from '@/utils/calendarDate';

export interface SpanTrip { startDay?: string | null; startDate?: { toDate(): Date } | null; endDate?: { toDate(): Date } | null }
export interface HomeTrips<T> { today: T | null; next: T | null; comingUp: T[]; showInspired: boolean; isEmpty: boolean }

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Calendar start and end: the saved `startDay` when valid, else `startDate`; no end → the start. */
export function tripSpan(t: SpanTrip): { start: string | null; end: string | null } {
  const start = typeof t.startDay === 'string' && DAY.test(t.startDay) ? t.startDay : t.startDate ? toCalendarDate(t.startDate.toDate()) : null;
  const end = t.endDate ? toCalendarDate(t.endDate.toDate()) : start;
  return { start, end: end && start && end < start ? start : end };
}

export function homeTrips<T extends SpanTrip>(trips: T[], today: string): HomeTrips<T> {
  const spans = trips.map((t) => ({ t, ...tripSpan(t) }));
  const current = spans.filter((s) => s.start && s.end && s.start <= today && today <= s.end)
    .sort((a, b) => b.start!.localeCompare(a.start!));
  const upcoming = spans.filter((s) => s.start && s.start > today).sort((a, b) => a.start!.localeCompare(b.start!));
  const undated = spans.filter((s) => !s.start);
  const todayTrip = current[0]?.t ?? null;
  const otherCurrent = current.slice(1).map((s) => s.t);
  const next = todayTrip ? null : (upcoming[0]?.t ?? null);
  const comingUp = [...otherCurrent, ...upcoming.map((s) => s.t).filter((t) => t !== next), ...undated.map((s) => s.t)];
  const ahead = (todayTrip ? 1 : 0) + (next ? 1 : 0) + comingUp.length;
  return { today: todayTrip, next, comingUp, showInspired: ahead <= 1, isEmpty: ahead === 0 };
}

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** A trip's eyebrow on Home: `NOV 18 – 24 · 7 DAYS`; the year only when it isn't this year; `DATES NOT SET`. */
export function homeEyebrow(span: { start: string | null; end: string | null }, today: string): string {
  if (!span.start) return 'DATES NOT SET';
  const end = span.end ?? span.start;
  const [y1, m1, d1] = span.start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const n = daysBetween(span.start, end) + 1;
  const len = `${n} ${n === 1 ? 'DAY' : 'DAYS'}`;
  const year = y1 !== Number(today.slice(0, 4)) || y2 !== y1 ? `, ${y2}` : '';
  if (n === 1) return `${MON[m1 - 1]} ${d1}${year} · ${len}`;
  const right = m1 === m2 && y1 === y2 ? `${d2}` : `${MON[m2 - 1]} ${d2}`;
  return `${MON[m1 - 1]} ${d1} – ${right}${year} · ${len}`;
}
