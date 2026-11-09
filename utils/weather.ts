/**
 * Weather on trip days (owner, 2026-11-08; MET Norway since 2026-11-09 — Open-Meteo's free API is non-commercial).
 * MET Norway's Locationforecast is free for commercial use under CC BY 4.0 (credited "Weather: MET Norway" in
 * Settings → About and the privacy policy) and asks every request to identify the app (`MET_HEADERS`). Only a city's
 * rounded position is sent. Its hourly UTC forecast (~9 days) becomes each local day's high, low and midday sky. Pure;
 * hooks/useForecast fetches it once per city per day.
 */
export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
export type DayWeather = { kind: WeatherKind; max: number; min: number };

export const MET_HEADERS = { 'User-Agent': 'SupernovaTravel/1.1 (https://supernovatravel.xyz)' };

/** MET Norway symbol codes ("clearsky_day", "lightrainshowers_night", "heavyrainandthunder") → one of a few icons. */
export function symbolKind(symbol: string): WeatherKind {
  const s = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 'storm';
  if (s.includes('snow') || s.includes('sleet')) return 'snow';
  if (s.includes('rain') || s.includes('drizzle')) return 'rain';
  if (s === 'fog') return 'fog';
  if (s === 'clearsky' || s === 'fair') return 'sun';
  if (s === 'partlycloudy') return 'partly';
  return 'cloud';
}

export const forecastUrl = (lat: number, lng: number) =>
  `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`;

type Point = { time?: unknown; data?: { instant?: { details?: { air_temperature?: unknown } }; next_1_hours?: { summary?: { symbol_code?: unknown } }; next_6_hours?: { summary?: { symbol_code?: unknown } }; next_12_hours?: { summary?: { symbol_code?: unknown } } } };

/** Each local day's high, low and sky — the symbol nearest local noon; the local day from the city's longitude. */
export function parseForecast(json: unknown, lng: number): Record<string, DayWeather> {
  const series = (json as { properties?: { timeseries?: unknown } } | null)?.properties?.timeseries;
  if (!Array.isArray(series)) return {};
  const offsetMs = Math.round(lng / 15) * 3_600_000;
  const days = new Map<string, { max: number; min: number; sym: string | null; symDist: number }>();
  for (const p of series as Point[]) {
    const t = typeof p.time === 'string' ? Date.parse(p.time) : NaN;
    const temp = p.data?.instant?.details?.air_temperature;
    if (!Number.isFinite(t) || typeof temp !== 'number') continue;
    const local = new Date(t + offsetMs);
    const day = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();
    const sym = [p.data?.next_1_hours, p.data?.next_6_hours, p.data?.next_12_hours].map((x) => x?.summary?.symbol_code).find((x): x is string => typeof x === 'string') ?? null;
    const d = days.get(day) ?? { max: temp, min: temp, sym: null, symDist: 99 };
    d.max = Math.max(d.max, temp); d.min = Math.min(d.min, temp);
    if (sym && Math.abs(hour - 12) < d.symDist) { d.sym = sym; d.symDist = Math.abs(hour - 12); }
    days.set(day, d);
  }
  const out: Record<string, DayWeather> = {};
  for (const [day, d] of days) out[day] = { kind: d.sym ? symbolKind(d.sym) : 'cloud', max: d.max, min: d.min };
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
