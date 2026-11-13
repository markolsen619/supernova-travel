/** Public holidays on trip days (spec 2026-11-12): Nager.Date, nationwide Public holidays only. Pure. */
export type Holiday = { date: string; name: string };
export const HOLIDAY_TTL_MS = 90 * 86_400_000;

/** Whether an answer is a holiday list at all — only a real list is cached, so one bad answer can't hide holidays for 90 days. */
export const isHolidayList = (json: unknown): boolean => Array.isArray(json);

export function parseHolidays(json: unknown): Holiday[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((h) => {
    const x = h as { date?: unknown; name?: unknown; global?: unknown; types?: unknown };
    if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || typeof x.name !== 'string') return [];
    if (x.global !== true || !Array.isArray(x.types) || !x.types.includes('Public')) return [];
    return [{ date: x.date, name: x.name }];
  });
}

export const holidayOn = (date: string | null, holidays: Holiday[]) => (date ? holidays.find((h) => h.date === date) ?? null : null);
export const holidayLine = (h: Holiday) => `Public holiday: ${h.name} · many shops and museums may close`;

export function dayCountry(
  trip: { destination: { countryCode?: string | null }; additionalDestinations?: { countryCode?: string | null }[] },
  destinationIndex: number | null | undefined,
): string | null {
  const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
  const code = (cities[destinationIndex ?? 0]?.countryCode || trip.destination.countryCode || '').trim().toUpperCase();
  return code || null;
}
