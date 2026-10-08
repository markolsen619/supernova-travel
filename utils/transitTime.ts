/**
 * A time typed into a train/bus/ferry ticket ("9:05", "9.05", "0905") as the
 * stored "HH:MM", or null. Times are as printed on the ticket — local to the
 * station — and never converted.
 */
export function normalizeTime(input: string): string | null {
  const t = input.trim().replace('.', ':');
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Rows of `size` — for grids laid out as explicit rows (wrapping rows with gap mis-measure). */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
