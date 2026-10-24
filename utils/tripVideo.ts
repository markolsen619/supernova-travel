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

export const FILM_PHOTO_MAX = 8;

/**
 * Which stops show a photo in the trip video (owner, 2026-10-25): one per day first so the whole trip is covered,
 * then more in trip order, up to `max`. Only stops that have photos.
 */
export function pickFilmPhotos(
  days: { dayId: string; stopIds: string[] }[],
  photos: Record<string, { url: string }[] | undefined>,
  max = FILM_PHOTO_MAX,
): Set<string> {
  const withPhoto = (id: string) => (photos[id]?.length ?? 0) > 0;
  const picked = new Set<string>();
  for (const d of days) {
    if (picked.size >= max) break;
    const first = d.stopIds.find(withPhoto);
    if (first) picked.add(first);
  }
  for (const d of days) for (const id of d.stopIds) {
    if (picked.size >= max) return picked;
    if (withPhoto(id)) picked.add(id);
  }
  return picked;
}
