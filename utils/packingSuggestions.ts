import { COUNTRY_INFO } from '@/constants/countryInfo';
import { internationalCountries, tripCountries, type CountryTrip } from '@/utils/beforeYouGo';
import type { WeatherKind } from '@/utils/weather';

/** Smart packing suggestions (spec 2026-11-12): forecast, season by hemisphere, stops, plugs, length. Rule-based. Pure. */
export type PackDay = { date: string | null; lat: number | null; countryCode: string | null; weather: { kind: WeatherKind; max: number; min: number } | null; stops: { title: string; type: string }[] };
export type Suggestion = { label: string; category: string; reason: string };

const WET: WeatherKind[] = ['rain', 'snow', 'storm'];
const HIKE = /\b(hike|hiking|trail|trek|trekking|summit)\b|national park/i;
const BEACH = /\b(beach|playa|praia|plage|snorkel\w*)\b/i;
const FINE = /michelin|tasting menu|fine dining/i;
const MAX = 8;

/**
 * Labels that mean the same thing to pack (final review: "Passport" was suggested next to the template's "Passport /
 * ID"). A suggestion counts as packed when any label in its group is on the list.
 */
const SAME = [
  ['passport', 'passport / id'],
  ['plug adapter', 'power adapter'],
  ['warm coat', 'winter coat'],
  ['warm layers', 'thermal layers', 'layered clothing'],
  ['walking shoes', 'hiking boots', 'comfortable shoes'],
];
const canonical = (label: string) => {
  const l = label.trim().toLowerCase().replace(/\s*\(.*\)$/, '');
  return SAME.find((g) => g.includes(l))?.[0] ?? l;
};
export const packingCovered = (label: string, labels: string[]) => {
  const c = canonical(label);
  return labels.some((x) => canonical(x) === c);
};

export function packingSuggestions(a: { days: PackDay[]; trip: CountryTrip; home: string | null; existing: string[]; dismissed: string[]; month: number | null }): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (label: string, category: string, reason: string) => out.push({ label, category, reason });
  const forecast = a.days.filter((d) => d.weather);
  const rainy = forecast.filter((d) => WET.includes(d.weather!.kind)).length;
  if (rainy >= 2) add('Umbrella or rain jacket', 'Weather', `Rain on ${rainy} days`);
  const hi = Math.max(-Infinity, ...forecast.map((d) => d.weather!.max));
  const lo = Math.min(Infinity, ...forecast.map((d) => d.weather!.min));
  if (hi >= 28) { add('Sunscreen', 'Weather', `Highs of ${Math.round(hi)}°`); add('Sun hat', 'Weather', `Highs of ${Math.round(hi)}°`); }
  if (lo <= 5) { add('Warm coat', 'Weather', `Lows of ${Math.round(lo)}°`); add('Gloves', 'Weather', `Lows of ${Math.round(lo)}°`); }
  if (forecast.length === 0 && a.month) {
    const lat = a.days.find((d) => d.lat != null)?.lat ?? null;
    if (lat != null) {
      const north = lat >= 0;
      const winter = north ? [12, 1, 2].includes(a.month) : [6, 7, 8].includes(a.month);
      const summer = north ? [6, 7, 8].includes(a.month) : [12, 1, 2].includes(a.month);
      if (winter) add('Warm layers', 'Weather', 'Winter at your destination');
      if (summer) add('Sunscreen', 'Weather', 'Summer at your destination');
    }
  }
  const stopDay = (re: RegExp) => a.days.findIndex((d) => d.stops.some((s) => re.test(s.title)));
  const hikeDay = stopDay(HIKE);
  if (hikeDay >= 0) { add('Walking shoes', 'Activities', `Hike on day ${hikeDay + 1}`); add('Water bottle', 'Activities', `Hike on day ${hikeDay + 1}`); }
  const beachDay = stopDay(BEACH);
  if (beachDay >= 0) { add('Swimsuit', 'Activities', `Beach on day ${beachDay + 1}`); add('Beach towel', 'Activities', `Beach on day ${beachDay + 1}`); }
  const fineDay = stopDay(FINE);
  if (fineDay >= 0) add('Smart outfit', 'Clothing', `Fine dining on day ${fineDay + 1}`);
  const abroad = internationalCountries(tripCountries(a.trip), a.home);
  if (abroad.length > 0 && a.home) add('Passport', 'Documents', 'International trip');
  const homePlugs = a.home ? COUNTRY_INFO[a.home]?.plugs : undefined;
  if (homePlugs) {
    const odd = abroad.map((c) => COUNTRY_INFO[c]).find((c) => c && !c.plugs.some((p) => homePlugs.includes(p)));
    if (odd) add(`Plug adapter (type ${odd.plugs.join(' / ')})`, 'Electronics', `${odd.name} uses different plugs`);
  }
  if (a.days.length >= 7) add('Laundry bag', 'Essentials', `${a.days.length}-day trip`);

  const hidden = [...a.existing, ...a.dismissed];
  const seen: string[] = [];
  return out.filter((s) => {
    if (packingCovered(s.label, hidden) || packingCovered(s.label, seen)) return false;
    seen.push(s.label);
    return true;
  }).slice(0, MAX);
}
