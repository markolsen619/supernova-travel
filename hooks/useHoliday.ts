import { useQuery } from '@tanstack/react-query';
import { getHolidays } from '@/services/holidays';
import { holidayOn, type Holiday } from '@/utils/holidays';

/** The public holiday on a date in a country, or null (spec 2026-11-12). One cached fetch per country and year. */
export function useHoliday(countryCode: string | null, date: string | null): Holiday | null {
  const year = date ? Number(date.slice(0, 4)) : null;
  const { data } = useQuery({
    queryKey: ['holidays', countryCode, year],
    queryFn: () => getHolidays(countryCode!, year!),
    enabled: !!countryCode && !!year,
    staleTime: 24 * 60 * 60 * 1000,
  });
  return holidayOn(date, data ?? []);
}
