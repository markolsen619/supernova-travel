/**
 * Weather on trip days (owner, 2026-11-08): Open-Meteo's daily forecast (free, no key, up to 16 days). Only a city's
 * rounded position is sent — nothing about the traveler. Pure; hooks/useForecast fetches it once per city per day.
 */
export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
export type DayWeather = { kind: WeatherKind; max: number; min: number };

/** WMO weather codes (Open-Meteo `weather_code`) → one of a few icons. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloud';
}

export const forecastUrl = (lat: number, lng: number) => {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2), longitude: lng.toFixed(2),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '16',
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
};

/** The daily forecast keyed by the city's local date. */
export function parseForecast(json: unknown): Record<string, DayWeather> {
  const d = (json as { daily?: { time?: unknown; weather_code?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown } } | null)?.daily;
  if (!d || !Array.isArray(d.time) || !Array.isArray(d.weather_code) || !Array.isArray(d.temperature_2m_max) || !Array.isArray(d.temperature_2m_min)) return {};
  const out: Record<string, DayWeather> = {};
  d.time.forEach((day, i) => {
    const code = (d.weather_code as unknown[])[i], max = (d.temperature_2m_max as unknown[])[i], min = (d.temperature_2m_min as unknown[])[i];
    if (typeof day === 'string' && typeof code === 'number' && typeof max === 'number' && typeof min === 'number') out[day] = { kind: weatherKind(code), max, min };
  });
  return out;
}

const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'PR', 'GU', 'VI', 'AS', 'MP']);

/** Fahrenheit for the regions that read it (from the phone's locale, e.g. "en-US"). */
export const usesFahrenheit = (locale: string) => FAHRENHEIT.has((locale.split(/[-_]/)[1] ?? '').toUpperCase());

/** "24° / 16°" in the reader's unit. */
export function tempLabel(w: DayWeather, fahrenheit: boolean): string {
  const t = (c: number) => Math.round(fahrenheit ? c * 9 / 5 + 32 : c);
  return `${t(w.max)}° / ${t(w.min)}°`;
}
