/** A city's daily forecast (utils/weather): one MET Norway request per city per day, kept for the session. */
import { useQuery } from '@tanstack/react-query';
import { toCalendarDate } from '@/utils/calendarDate';
import { forecastUrl, MET_HEADERS, parseForecast, type DayWeather } from '@/utils/weather';

export function useForecast(lat: number | null | undefined, lng: number | null | undefined) {
  const ok = typeof lat === 'number' && typeof lng === 'number';
  return useQuery({
    queryKey: ['weather', ok ? lat!.toFixed(2) : null, ok ? lng!.toFixed(2) : null, toCalendarDate(new Date())],
    enabled: ok,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<Record<string, DayWeather>> => {
      const r = await fetch(forecastUrl(lat!, lng!), { headers: MET_HEADERS });
      return r.ok ? parseForecast(await r.json(), lng!) : {};
    },
  });
}
