import { useQueries } from '@tanstack/react-query';
import { forecastQueryOptions } from '@/hooks/useForecast';
import type { TripWithDays } from '@/types';
import type { DayWeather } from '@/utils/weather';

/** Each city's ~9-day forecast for the packing suggestions (spec 2026-11-12), shared with day headings' cache. */
export function useTripForecasts(trip: TripWithDays | undefined): Record<string, Record<string, DayWeather>> {
  const cities = trip ? [trip.destination, ...(trip.additionalDestinations ?? [])] : [];
  const results = useQueries({ queries: cities.map((c) => forecastQueryOptions(c.lat, c.lng)) });
  const out: Record<string, Record<string, DayWeather>> = {};
  cities.forEach((c, i) => {
    const data = results[i]?.data;
    if (typeof c.lat === 'number' && typeof c.lng === 'number' && data) out[`${c.lat.toFixed(2)},${c.lng.toFixed(2)}`] = data;
  });
  return out;
}
