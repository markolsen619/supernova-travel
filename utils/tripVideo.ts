/** Captions for the trip video (spec 2026-10-24-trip-video-design.md §2). */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const length = (n: number) => `${n} ${n === 1 ? 'DAY' : 'DAYS'}`;

export function openingEyebrow(start: Date | null, end: Date | null, dayCount: number): string {
  if (!start || !end) return length(dayCount);
  const a = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const sameDay = start.toDateString() === end.toDateString();
  const b = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear() ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${sameDay ? a : `${a} – ${b}`} · ${length(dayCount)}`;
}

export function dayCaption(dayNumber: number, city: string | null): string {
  const c = city?.trim();
  return c ? `DAY ${dayNumber} · ${c.toUpperCase()}` : `DAY ${dayNumber}`;
}
