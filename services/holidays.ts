import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOLIDAY_TTL_MS, isHolidayList, parseHolidays, type Holiday } from '@/utils/holidays';

/**
 * A country's public holidays for a year (spec 2026-11-12), from Nager.Date's free API — only the country code and
 * year are sent — kept on the phone for 90 days. Never throws: a failed fetch is no holidays, and isn't cached.
 */
export async function getHolidays(countryCode: string, year: number): Promise<Holiday[]> {
  const key = `holidays:${countryCode}:${year}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as { at: number; list: Holiday[] };
      if (Date.now() - saved.at < HOLIDAY_TTL_MS && Array.isArray(saved.list)) return saved.list;
    }
  } catch { /* fall through to a fetch */ }
  try {
    const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
    if (!r.ok) return [];
    const json: unknown = await r.json();
    const list = parseHolidays(json);
    if (isHolidayList(json)) AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), list })).catch(() => {});
    return list;
  } catch {
    return [];
  }
}
