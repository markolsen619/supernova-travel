# Smart packing, holidays and the Home Screen widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** three things, at no running cost:
- packing suggestions from forecast, stops, plugs and trip length;
- public-holiday lines on trip days and Home;
- an iPhone and Android Home Screen widget that adapts to flight day, trip day, trip ahead, or nothing planned.

**Architecture:**
- **Pure rules:** `utils/packingSuggestions.ts`, `utils/holidays.ts` and `utils/widgetTimeline.ts` (the widget's next-48-hours entries, shared by both platforms).
- **Services:** holidays are cached per country and year in AsyncStorage (`services/holidays.ts`); the widget's data is written by `services/widgetData.ts`.
- **iPhone widget:** WidgetKit via `@bacons/apple-targets`, reading an App Group through a local Expo module (`modules/widget-bridge`).
- **Android widget:** `react-native-android-widget`, rendering the same entries.

**Tech Stack:** Expo SDK 54 / RN 0.81, TanStack Query, AsyncStorage, `@bacons/apple-targets@5` (peer `expo >=52`), `react-native-android-widget@0.26` (peer `expo >=54`), SwiftUI/WidgetKit, Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-11-12-packing-holidays-widget-design.md`

## Global Constraints

**Packing**
- Suggestions only. Existing lists are never rewritten. A new (empty) list is seeded with templates + suggestions.
- A suggestion whose label is already on the list (case-insensitive) is hidden.
- Dismissals are stored on the phone at `packingDismissed:{tripId}`.
- Suggestions are capped at 8, in the spec table's order:
  1. rain on ≥ 2 trip days → "Umbrella or rain jacket";
  2. any high ≥ 28° → "Sunscreen" and "Sun hat";
  3. any low ≤ 5° → "Warm coat" and "Gloves";
  4. no forecast → season by hemisphere (latitude < 0 flips it), "Warm layers" (winter) or "Sunscreen" (summer);
  5. a hike stop (hike, trail, trek, hiking, summit, national park) → "Walking shoes" and "Water bottle";
  6. a beach stop (beach, playa, praia, plage, snorkel) → "Swimsuit" and "Beach towel";
  7. a fine-dining stop (michelin, tasting menu, fine dining) → "Smart outfit";
  8. international → "Passport";
  9. plugs differ from home → "Plug adapter (type C / E)";
  10. 7+ days → "Laundry bag".

**Holidays**
- Only Nager.Date entries with `global: true` and `types` including `Public`.
- Endpoint: `https://date.nager.at/api/v3/PublicHolidays/{year}/{CC}`.
- Cache key `holidays:{CC}:{year}`, refreshed after 90 days. A failed fetch shows nothing.
- Line: "Public holiday: {name} · many shops and museums may close".
- Shown to anyone who can see the trip. Undated trips show nothing.

**Widget**
- States, first match wins:
  1. **flight:** a boarding pass departing within 6 h, not cancelled or completed. The window runs from depart − 6 h to depart + 1 h.
  2. **trip:** today is within a trip.
  3. **countdown:** a trip ahead.
  4. **empty.**
- Next stop: the first of today's stops, in order, whose time is ahead. Untimed stops count in order after the last passed timed stop. With no times at all, the first unvisited stop. When all are done: "Tomorrow: {first stop}".
- Taps: flight → `supernova://boarding-pass/{id}`, trip and countdown → `supernova://trip/{id}`, empty → `supernova://create`.
- No network from the widget, nothing sent anywhere.
- App Group: `group.com.supernovatravel.app`.

**General**
- Pure tests only (`npx jest <path>`); typecheck `npx tsc --noEmit -p .`; lint `npx expo lint`.
- UI rules: `useTheme` colors, Phosphor icons, no emoji, 44 pt targets, `useCallback` handlers, sentence case.

## Review Focus

1. **A trip day whose city is in another country** (multi-country trips): the holiday comes from that day's country, not the trip's first. Pinned in Task 3.
2. **Packing for a trip in the Southern Hemisphere in July:** winter suggestions, not summer. Pinned in Task 1.
3. **Widget at 23:59 to 00:01:** the next day's stops take over at midnight, and an entry exists exactly at midnight. Pinned in Task 5.
4. **Widget with a flight and a trip on the same day:** the flight shows from depart − 6 h until depart + 1 h, then the trip view. Pinned in Task 5.
5. **Holiday fetch failing or returning junk:** no line, no crash, nothing cached. Pinned in Task 3.

---

### Task 1: Packing suggestions (pure)

**Files:**
- Create: `utils/packingSuggestions.ts`
- Test: `__tests__/utils/packingSuggestions.test.ts`

**Interfaces:**
- Consumes: `internationalCountries`, `tripCountries`, `CountryTrip` (`utils/beforeYouGo`); `COUNTRY_INFO` (`constants/countryInfo`); `WeatherKind` (`utils/weather`).
- Produces:
  - `type PackDay = { date: string | null; lat: number | null; countryCode: string | null; weather: { kind: WeatherKind; max: number; min: number } | null; stops: { title: string; type: string }[] }`
  - `type Suggestion = { label: string; category: string; reason: string }`
  - `packingSuggestions(a: { days: PackDay[]; trip: CountryTrip; home: string | null; existing: string[]; dismissed: string[]; month: number | null }): Suggestion[]`
  - `month` is the trip's start month, 1–12, or null.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/packingSuggestions.test.ts`:

```ts
import { packingSuggestions, type PackDay } from '@/utils/packingSuggestions';

const day = (over: Partial<PackDay> = {}): PackDay => ({ date: '2026-11-18', lat: 50, countryCode: 'CZ', weather: null, stops: [], ...over });
const trip = (codes: string[]) => ({ destination: { countryCode: codes[0] }, additionalDestinations: codes.slice(1).map((c) => ({ countryCode: c })) });
const base = { trip: trip(['CZ']), home: 'US' as string | null, existing: [] as string[], dismissed: [] as string[], month: 11 as number | null };
const labels = (s: { label: string }[]) => s.map((x) => x.label);

describe('packingSuggestions', () => {
  it('rain on 2+ days → umbrella, with the count as the reason', () => {
    const rain = { kind: 'rain', max: 10, min: 5 } as never;
    const s = packingSuggestions({ ...base, days: [day({ weather: rain }), day({ weather: rain }), day({ weather: rain })] });
    expect(s[0]).toEqual({ label: 'Umbrella or rain jacket', category: 'Weather', reason: 'Rain on 3 days' });
  });
  it('heat and cold from the forecast', () => {
    const s = packingSuggestions({ ...base, days: [day({ weather: { kind: 'clear', max: 31, min: 20 } as never }), day({ weather: { kind: 'clear', max: 8, min: 2 } as never })] });
    expect(labels(s)).toEqual(expect.arrayContaining(['Sunscreen', 'Sun hat', 'Warm coat', 'Gloves']));
    expect(s.find((x) => x.label === 'Sun hat')?.reason).toBe('Highs of 31°');
    expect(s.find((x) => x.label === 'Gloves')?.reason).toBe('Lows of 2°');
  });
  it('no forecast: season by hemisphere (review focus 2)', () => {
    expect(labels(packingSuggestions({ ...base, month: 7, days: [day({ lat: -34.6, countryCode: 'AR' })], trip: trip(['AR']) }))).toContain('Warm layers');
    expect(labels(packingSuggestions({ ...base, month: 7, days: [day({ lat: 41.9, countryCode: 'IT' })], trip: trip(['IT']) }))).toContain('Sunscreen');
  });
  it('stops: hikes, beaches and fine dining', () => {
    const s = packingSuggestions({ ...base, days: [day({ stops: [{ title: 'Hike to Petřín summit', type: 'activity' }, { title: 'Beach day at Playa Norte', type: 'activity' }, { title: 'Tasting menu at Field', type: 'restaurant' }] })] });
    expect(labels(s)).toEqual(expect.arrayContaining(['Walking shoes', 'Swimsuit', 'Smart outfit']));
  });
  it('international: passport, and an adapter when plugs differ', () => {
    const s = packingSuggestions({ ...base, days: [day()] });
    expect(labels(s)).toEqual(expect.arrayContaining(['Passport', 'Plug adapter (type C / E)']));
    expect(labels(packingSuggestions({ ...base, home: 'CZ', days: [day()] }))).not.toContain('Passport');
  });
  it('7+ days → laundry bag', () => {
    expect(labels(packingSuggestions({ ...base, days: Array.from({ length: 7 }, () => day()) }))).toContain('Laundry bag');
  });
  it('hides what is already packed or dismissed (case-insensitive) and caps at 8', () => {
    const rain = { kind: 'rain', max: 31, min: 2 } as never;
    const many = packingSuggestions({ ...base, days: Array.from({ length: 8 }, () => day({ weather: rain, stops: [{ title: 'Hike and beach', type: 'activity' }] })) });
    expect(many.length).toBe(8);
    const s = packingSuggestions({ ...base, existing: ['passport'], dismissed: ['Laundry bag'], days: Array.from({ length: 8 }, () => day()) });
    expect(labels(s)).not.toContain('Passport');
    expect(labels(s)).not.toContain('Laundry bag');
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/packingSuggestions.test.ts`
  - Expected: FAIL (module missing).

- [ ] **Step 3: Write `utils/packingSuggestions.ts`:**

```ts
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

  const hidden = new Set([...a.existing, ...a.dismissed].map((l) => l.trim().toLowerCase()));
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = s.label.toLowerCase();
    if (hidden.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MAX);
}
```

  Check `WeatherKind`'s members in `utils/weather.ts` (`symbolKind`). If the wet kinds are named differently (e.g. `'showers'`, `'thunder'`), use those names in `WET` and the tests, and ledger it as a ruling. The "Passport" rule needs a known home: with an unknown home every country counts as international, which would wrongly suggest a passport for a domestic trip.

- [ ] **Step 4: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/packingSuggestions.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add utils/packingSuggestions.ts __tests__/utils/packingSuggestions.test.ts
git commit -m "feat(packing): smart suggestions (forecast, hemisphere season, stops, plugs, length)"
```

---

### Task 2: Suggestions on the packing screen

**Files:**
- Modify: `hooks/useForecast.ts` (export the query options)
- Create: `hooks/useTripForecasts.ts`
- Create: `components/packing/PackingSuggestions.tsx`
- Modify: `app/trip/packing.tsx`, `hooks/usePackingList.ts`

**Interfaces:**
- Consumes: `packingSuggestions`, `PackDay` (Task 1); `homeRegion` (`utils/homeRegion`); `dayDateFor` (`utils/tripTours`); `tripSpan` (`utils/homeState`).
- Produces:
  - `forecastQueryOptions(lat, lng)`, exported from `hooks/useForecast.ts`.
  - `useTripForecasts(trip: TripWithDays | undefined): Record<string, Record<string, DayWeather>>`, keyed by `"{lat2},{lng2}"`.
  - `PackingSuggestions({ suggestions, onAdd, onDismiss })`.

- [ ] **Step 1: Export the forecast query options.** In `hooks/useForecast.ts`, move the object passed to `useQuery` into `export function forecastQueryOptions(lat: number | null | undefined, lng: number | null | undefined)`, which returns the same `{ queryKey, enabled, staleTime, gcTime, queryFn }`. Make `useForecast` call `useQuery(forecastQueryOptions(lat, lng))`. Behaviour is unchanged.

- [ ] **Step 2: Write `hooks/useTripForecasts.ts`:**

```ts
import { useQueries } from '@tanstack/react-query';
import { forecastQueryOptions } from '@/hooks/useForecast';
import type { TripWithDays } from '@/types';
import type { DayWeather } from '@/utils/weather';

/** Each city's ~9-day forecast for the packing suggestions (spec 2026-11-12), one request per city per day (shared cache). */
export function useTripForecasts(trip: TripWithDays | undefined): Record<string, Record<string, DayWeather>> {
  const cities = trip ? [trip.destination, ...(trip.additionalDestinations ?? [])] : [];
  const results = useQueries({ queries: cities.map((c) => forecastQueryOptions(c.lat, c.lng)) });
  const out: Record<string, Record<string, DayWeather>> = {};
  cities.forEach((c, i) => { if (typeof c.lat === 'number' && typeof c.lng === 'number' && results[i]?.data) out[`${c.lat.toFixed(2)},${c.lng.toFixed(2)}`] = results[i].data as Record<string, DayWeather>; });
  return out;
}
```

  Check `useForecast`'s `queryFn` result type. If it isn't `Record<string, DayWeather>`, adapt the cast to its actual return.

- [ ] **Step 3: Build the suggestions in `app/trip/packing.tsx`.**
  - After the trip and items load, compute `days: PackDay[]` from `trip.days`, sorted by `dayNumber`:
    - the city is `[trip.destination, ...additionalDestinations][day.destinationIndex ?? 0]`;
    - `date = dayDateFor(tripSpan(trip).start, day.dayNumber)`;
    - `weather = forecasts["{lat2},{lng2}"]?.[date] ?? null`;
    - `stops = day.activities.map((x) => ({ title: x.title, type: x.type }))`.
  - `month` is the start date's month (`Number(start.slice(5, 7))`) or null.
  - `home = homeRegion(Intl.DateTimeFormat().resolvedOptions().locale)`.
  - `existing` is the current item labels.
  - `dismissed` comes from AsyncStorage `packingDismissed:{tripId}`, read once into state with a try/catch fallback to `[]`.
  - `suggestions = useMemo(() => packingSuggestions({...}), [...])`.

- [ ] **Step 4: Write `components/packing/PackingSuggestions.tsx`.**
  - Renders nothing when there are no suggestions.
  - A section titled "SUGGESTED FOR THIS TRIP" (eyebrow style, as the screen's category headers).
  - One row per suggestion:
    - the label (15 pt, `colors.text.primary`) and the reason (13 pt, `colors.text.tertiary`);
    - a `Plus` button (bold 16, 44 pt target, `accessibilityLabel` `Add ${label}`), which calls `onAdd` with Medium haptic;
    - an `X` button (bold 14, 44 pt, `accessibilityLabel` `Dismiss ${label}`), which calls `onDismiss` with Light haptic.
  - Card background `colors.background.card`, radius 16.
  - Place it at the top of the packing list's scroll content.
  - In `packing.tsx`:
    - `onAdd = useCallback((s) => addItem.mutate({ label: s.label, category: s.category, addedByUid: uid }), …)`;
    - `onDismiss = useCallback((s) => { const next = [...dismissed, s.label]; setDismissed(next); AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {}); }, …)`.

- [ ] **Step 5: Seed new lists with the suggestions.** In `hooks/usePackingList.ts`, give the hook an optional 4th parameter `extra: { label: string; category: string }[] = []`. Where it seeds an empty list, write `generatePackingList(trip)` **plus** the `extra` items whose label (lower-cased) isn't already among the template labels. `packing.tsx` passes the current suggestions as `extra`.
  - **Caveat:** the seed runs once, on first open. If the forecast hasn't arrived yet, the seed has only the stop, plug and length suggestions, and the forecast ones appear in the section moments later. That's acceptable.

- [ ] **Step 6: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "packing|useTripForecasts|useForecast" | head`
  - Expected: clean.

- [ ] **Step 7: Commit.**

```bash
git add hooks/useForecast.ts hooks/useTripForecasts.ts components/packing/PackingSuggestions.tsx app/trip/packing.tsx hooks/usePackingList.ts
git commit -m "feat(packing): Suggested for this trip on the packing screen; new lists start with them"
```

---

### Task 3: Holidays — rules and cache

**Files:**
- Create: `utils/holidays.ts`
- Create: `services/holidays.ts`
- Create: `hooks/useHoliday.ts`
- Test: `__tests__/utils/holidays.test.ts`

**Interfaces:**
- Produces:
  - `type Holiday = { date: string; name: string }`
  - `parseHolidays(json: unknown): Holiday[]`, keeping global Public holidays only, junk → `[]`.
  - `holidayOn(date: string | null, holidays: Holiday[]): Holiday | null`
  - `holidayLine(h: Holiday): string`
  - `dayCountry(trip: { destination: { countryCode?: string | null }; additionalDestinations?: { countryCode?: string | null }[] }, destinationIndex: number | null | undefined): string | null`
  - `HOLIDAY_TTL_MS = 90 days`
  - `getHolidays(countryCode: string, year: number): Promise<Holiday[]>` (service, never throws)
  - `useHoliday(countryCode: string | null, date: string | null): Holiday | null` (hook)

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/holidays.test.ts`:

```ts
import { parseHolidays, holidayOn, holidayLine, dayCountry } from '@/utils/holidays';

const nager = [
  { date: '2026-11-17', localName: 'Den boje', name: 'Struggle for Freedom and Democracy Day', global: true, types: ['Public'] },
  { date: '2026-11-18', localName: 'X', name: 'Regional day', global: false, types: ['Public'] },
  { date: '2026-11-19', localName: 'Y', name: 'Bank holiday', global: true, types: ['Bank'] },
];

describe('holidays', () => {
  it('keeps nationwide public holidays only', () => {
    expect(parseHolidays(nager)).toEqual([{ date: '2026-11-17', name: 'Struggle for Freedom and Democracy Day' }]);
  });
  it('junk → none (review focus 5)', () => {
    expect(parseHolidays(null)).toEqual([]);
    expect(parseHolidays({ error: 'x' })).toEqual([]);
    expect(parseHolidays([{ date: 5 }])).toEqual([]);
  });
  it('finds the holiday on a day; nothing for an undated day', () => {
    const list = parseHolidays(nager);
    expect(holidayOn('2026-11-17', list)?.name).toBe('Struggle for Freedom and Democracy Day');
    expect(holidayOn('2026-11-18', list)).toBeNull();
    expect(holidayOn(null, list)).toBeNull();
  });
  it('the line', () => {
    expect(holidayLine({ date: '2026-11-17', name: 'Christmas Day' })).toBe('Public holiday: Christmas Day · many shops and museums may close');
  });
  it("a day's country is its city's, else the trip's first (review focus 1)", () => {
    const trip = { destination: { countryCode: 'cz' }, additionalDestinations: [{ countryCode: 'HU' }, { countryCode: null }] };
    expect(dayCountry(trip, 0)).toBe('CZ');
    expect(dayCountry(trip, 1)).toBe('HU');
    expect(dayCountry(trip, 2)).toBe('CZ');
    expect(dayCountry(trip, undefined)).toBe('CZ');
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/holidays.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Write `utils/holidays.ts`:**

```ts
/** Public holidays on trip days (spec 2026-11-12): Nager.Date, nationwide Public holidays only. Pure. */
export type Holiday = { date: string; name: string };
export const HOLIDAY_TTL_MS = 90 * 86_400_000;

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
```

- [ ] **Step 4: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/holidays.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Write `services/holidays.ts`:**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOLIDAY_TTL_MS, parseHolidays, type Holiday } from '@/utils/holidays';

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
    const list = parseHolidays(await r.json());
    AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), list })).catch(() => {});
    return list;
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Write `hooks/useHoliday.ts`:**

```ts
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
```

- [ ] **Step 7: Typecheck and commit.**
  - Run: `npx tsc --noEmit -p .`
  - Expected: clean.

```bash
git add utils/holidays.ts services/holidays.ts hooks/useHoliday.ts __tests__/utils/holidays.test.ts
git commit -m "feat(holidays): Nager.Date public holidays, cached per country and year"
```

---

### Task 4: Holiday lines on trip days and Home; credit

**Files:**
- Create: `components/ui/HolidayLine.tsx`
- Modify: `components/trip/DayTimeline.tsx`, `app/trip/[id].tsx`, `components/home/TodayCard.tsx`, `app/(tabs)/index.tsx`, `app/settings/index.tsx`, `hosting/privacy.html`

**Interfaces:**
- Consumes: `useHoliday`, `holidayLine`, `dayCountry` (Task 3); `dayDateFor`.
- Produces:
  - `HolidayLine({ countryCode, date })`, which renders nothing without a holiday.
  - `DayTimeline` prop `notice?: React.ReactNode`.

- [ ] **Step 1: Write `components/ui/HolidayLine.tsx`.** It calls `useHoliday(countryCode, date)` and renders null without a holiday. Otherwise it renders a row: `CalendarX` duotone 14 (`colors.accent.amber`, or `colors.text.secondary` if amber isn't in the theme) and the text `holidayLine(h)` (13 pt, `colors.text.secondary`, `numberOfLines={2}`). Add `accessibilityRole="text"`.

- [ ] **Step 2: Put the line under the day heading.** In `components/trip/DayTimeline.tsx`, add the prop `notice?: React.ReactNode`. Render `{notice}` directly under the header row, with the same left padding as the header title. In `app/trip/[id].tsx`, where `<DayTimeline … weather={…}>` is rendered, add:

```tsx
notice={<HolidayLine countryCode={dayCountry(trip, day.destinationIndex)} date={dayDateFor(tripStartDay, day.dayNumber)} />}
```

- [ ] **Step 3: Put the line on Home's Today card.** In `components/home/TodayCard.tsx`, add the prop `countryCode?: string | null` and render `<HolidayLine countryCode={countryCode ?? null} date={toCalendarDate(new Date())} />` under the card's day line. In `app/(tabs)/index.tsx`, pass `countryCode={todayCity?.countryCode ?? null}` to `<TodayCard>` (`todayCity` already exists there).

- [ ] **Step 4: Credit.**
  - In `app/settings/index.tsx`, after the "Weather data" row, add `<SettingsRow label="Holiday data" value="Nager.Date" onPress={() => { WebBrowser.openBrowserAsync('https://date.nager.at').catch(() => {}); }} showDivider />`.
  - In `hosting/privacy.html`'s external services section, add: Nager.Date (public holidays) receives only a country code and year.

- [ ] **Step 5: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "HolidayLine|DayTimeline|TodayCard|settings/index" | head`
  - Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add components/ui/HolidayLine.tsx components/trip/DayTimeline.tsx "app/trip/[id].tsx" components/home/TodayCard.tsx "app/(tabs)/index.tsx" app/settings/index.tsx hosting/privacy.html
git commit -m "feat(holidays): public holiday lines on trip days and Today; Nager.Date credit"
```

---

### Task 5: Widget timeline (pure)

**Files:**
- Create: `utils/widgetTimeline.ts`
- Test: `__tests__/utils/widgetTimeline.test.ts`

**Interfaces:**
- Produces:
  - `type WidgetStop = { title: string; time: string | null; visited: boolean }`, where time is local "HH:MM".
  - `type WidgetInput = { trip: { id: string; title: string; start: string | null; end: string | null; coverKey: string | null; days: { date: string; city: string; stops: WidgetStop[]; weather: string | null }[] } | null; flight: { id: string; flightNumber: string; route: string; departMs: number; departLocal: string; gate: string | null; status: string | null } | null; wishCity: string | null }`
  - `type WidgetView = { kind: 'flight' | 'trip' | 'countdown' | 'empty'; eyebrow: string; title: string; detail: string | null; second: string | null; url: string; imageKey: string | null }`
  - `widgetView(input: WidgetInput, nowMs: number): WidgetView`
  - `widgetTimeline(input: WidgetInput, nowMs: number): { at: number; view: WidgetView }[]`, entries sorted, starting at `nowMs`, covering 48 h, consecutive duplicates merged.
  - Local time comes from the phone: `new Date(ms)` local fields.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/widgetTimeline.test.ts`. Pin the timezone first so dates are stable. Run with `TZ=UTC` set in the test file via `process.env.TZ = 'UTC'` **before** importing (Jest workers honour it). If the project's Jest config already sets `TZ`, use that.

```ts
process.env.TZ = 'UTC';
import { widgetView, widgetTimeline, type WidgetInput } from '@/utils/widgetTimeline';

const at = (iso: string) => Date.parse(iso);
const trip = {
  id: 't1', title: 'Prague, Budapest & more', start: '2026-11-18', end: '2026-12-05', coverKey: 'cover-t1',
  days: [
    { date: '2026-11-20', city: 'Prague', weather: '9° cloudy', stops: [
      { title: 'Prague Castle', time: '10:00', visited: false }, { title: 'Lunch at Lokál', time: null, visited: false }, { title: 'Charles Bridge', time: '18:00', visited: false }] },
    { date: '2026-11-21', city: 'Prague', weather: null, stops: [{ title: 'Train to Budapest', time: '09:19', visited: false }] },
  ],
};
const base: WidgetInput = { trip, flight: null, wishCity: null };

describe('widgetView', () => {
  it('before a trip: countdown', () => {
    const v = widgetView(base, at('2026-11-12T12:00:00Z'));
    expect(v).toMatchObject({ kind: 'countdown', eyebrow: '6 DAYS', title: 'Prague, Budapest & more', url: 'supernova://trip/t1', imageKey: 'cover-t1' });
  });
  it('during a trip: next stop by time; untimed stops follow the last passed timed one', () => {
    expect(widgetView(base, at('2026-11-20T08:00:00Z'))).toMatchObject({ kind: 'trip', eyebrow: 'DAY 3 · PRAGUE', title: 'Prague Castle', detail: '10:00', second: 'Then Lunch at Lokál' });
    expect(widgetView(base, at('2026-11-20T11:00:00Z'))).toMatchObject({ title: 'Lunch at Lokál', detail: null, second: 'Then Charles Bridge' });
  });
  it("today's stops done: tomorrow's first", () => {
    expect(widgetView(base, at('2026-11-20T19:00:00Z'))).toMatchObject({ kind: 'trip', title: 'Tomorrow: Train to Budapest', detail: '09:19' });
  });
  it('flight within 6 h wins, until an hour after departure (review focus 4)', () => {
    const flight = { id: 'p1', flightNumber: 'KL1357', route: 'AMS → PRG', departMs: at('2026-11-20T15:10:00Z'), departLocal: '16:10', gate: 'D8', status: null };
    expect(widgetView({ ...base, flight }, at('2026-11-20T09:00:00Z')).kind).toBe('flight');
    expect(widgetView({ ...base, flight }, at('2026-11-20T10:00:00Z'))).toMatchObject({ kind: 'flight', title: 'KL1357', detail: 'Departs 16:10 · Gate D8', url: 'supernova://boarding-pass/p1' });
    expect(widgetView({ ...base, flight }, at('2026-11-20T16:30:00Z')).kind).toBe('trip');
  });
  it('nothing planned: invite to plan, with the top saved city', () => {
    expect(widgetView({ trip: null, flight: null, wishCity: 'Lisbon' }, at('2026-11-12T12:00:00Z'))).toMatchObject({ kind: 'empty', title: 'Plan your next trip', detail: 'Lisbon is on your wish list', url: 'supernova://create' });
  });
});

describe('widgetTimeline', () => {
  it('starts now, changes as stops pass and at midnight (review focus 3)', () => {
    const entries = widgetTimeline(base, at('2026-11-20T08:00:00Z'));
    expect(entries[0].at).toBe(at('2026-11-20T08:00:00Z'));
    expect(entries.map((e) => e.at)).toEqual(expect.arrayContaining([at('2026-11-20T10:00:00Z'), at('2026-11-21T00:00:00Z')]));
    expect(entries.every((e, i) => i === 0 || e.at > entries[i - 1].at)).toBe(true);
    expect(entries[entries.length - 1].at).toBeLessThanOrEqual(at('2026-11-22T08:00:00Z'));
  });
  it('merges consecutive identical views', () => {
    const entries = widgetTimeline({ trip: null, flight: null, wishCity: null }, at('2026-11-12T12:00:00Z'));
    expect(entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/widgetTimeline.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Write `utils/widgetTimeline.ts`:**

```ts
/**
 * The Home Screen widget's content (spec 2026-11-12), worked out ahead for both platforms: what to show at a moment
 * (flight day → trip day → trip ahead → nothing) and the next 48 h of moments where that changes. Times are the
 * phone's local clock. Pure.
 */
export type WidgetStop = { title: string; time: string | null; visited: boolean };
export type WidgetInput = {
  trip: { id: string; title: string; start: string | null; end: string | null; coverKey: string | null; days: { date: string; city: string; stops: WidgetStop[]; weather: string | null }[] } | null;
  flight: { id: string; flightNumber: string; route: string; departMs: number; departLocal: string; gate: string | null; status: string | null } | null;
  wishCity: string | null;
};
export type WidgetView = { kind: 'flight' | 'trip' | 'countdown' | 'empty'; eyebrow: string; title: string; detail: string | null; second: string | null; url: string; imageKey: string | null };

const H = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localHM = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** Local midnight that ends `day` (YYYY-MM-DD). */
const midnightAfter = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d + 1).getTime(); };
const at = (day: string, hm: string) => { const [y, m, d] = day.split('-').map(Number); const [hh, mm] = hm.split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };

/** Today's next stop: the first whose time is ahead; an untimed stop counts once the timed stop before it has passed. */
function nextStops(stops: WidgetStop[], nowHM: string): WidgetStop[] {
  const anyTime = stops.some((s) => s.time);
  if (!anyTime) return stops.filter((s) => !s.visited);
  let lastPassed = -1;
  stops.forEach((s, i) => { if (s.time && s.time <= nowHM) lastPassed = i; });
  return stops.slice(lastPassed + 1);
}

export function widgetView(input: WidgetInput, nowMs: number): WidgetView {
  const f = input.flight;
  if (f && nowMs >= f.departMs - 6 * H && nowMs < f.departMs + H) {
    return { kind: 'flight', eyebrow: `FLIGHT TODAY · ${f.route}`, title: f.flightNumber, detail: `Departs ${f.departLocal}${f.gate ? ` · Gate ${f.gate}` : ''}`, second: f.status, url: `supernova://boarding-pass/${f.id}`, imageKey: null };
  }
  const t = input.trip;
  const today = localDay(nowMs);
  if (t && t.start && t.start <= today && (t.end ?? t.start) >= today) {
    const i = t.days.findIndex((d) => d.date === today);
    const url = `supernova://trip/${t.id}`;
    const dayNo = daysBetween(t.start, today) + 1;
    if (i < 0) return { kind: 'trip', eyebrow: `DAY ${dayNo}`, title: t.title, detail: null, second: null, url, imageKey: t.coverKey };
    const day = t.days[i];
    const eyebrow = `DAY ${dayNo} · ${day.city.toUpperCase()}`;
    const left = nextStops(day.stops, localHM(nowMs));
    if (left.length > 0) {
      return { kind: 'trip', eyebrow, title: left[0].title, detail: left[0].time, second: left[1] ? `Then ${left[1].title}` : day.weather, url, imageKey: null };
    }
    const tomorrow = t.days[i + 1]?.stops[0];
    return { kind: 'trip', eyebrow, title: tomorrow ? `Tomorrow: ${tomorrow.title}` : 'Done for today', detail: tomorrow?.time ?? null, second: day.weather, url, imageKey: null };
  }
  if (t && t.start && t.start > today) {
    const n = daysBetween(today, t.start);
    return { kind: 'countdown', eyebrow: n === 1 ? 'TOMORROW' : `${n} DAYS`, title: t.title, detail: null, second: null, url: `supernova://trip/${t.id}`, imageKey: t.coverKey };
  }
  return { kind: 'empty', eyebrow: 'SUPERNOVA', title: 'Plan your next trip', detail: input.wishCity ? `${input.wishCity} is on your wish list` : null, second: null, url: 'supernova://create', imageKey: null };
}

const same = (a: WidgetView, b: WidgetView) => JSON.stringify(a) === JSON.stringify(b);

export function widgetTimeline(input: WidgetInput, nowMs: number): { at: number; view: WidgetView }[] {
  const end = nowMs + 48 * H;
  const points = new Set<number>([nowMs]);
  let day = localDay(nowMs);
  for (let k = 0; k < 3; k++) { points.add(midnightAfter(day)); day = localDay(midnightAfter(day)); }
  for (const d of input.trip?.days ?? []) for (const s of d.stops) if (s.time) points.add(at(d.date, s.time) + 60_000);
  if (input.flight) { points.add(input.flight.departMs - 6 * H); points.add(input.flight.departMs + H); }
  const out: { at: number; view: WidgetView }[] = [];
  for (const p of [...points].filter((p) => p >= nowMs && p <= end).sort((a, b) => a - b)) {
    const view = widgetView(input, p);
    if (out.length === 0 || !same(out[out.length - 1].view, view)) out.push({ at: p, view });
  }
  return out;
}
```

  The `+ 60_000` (one minute after a stop's time) makes the following stop "next" once a stop's time has passed. That matches `nextStops`'s `<=` comparison.

- [ ] **Step 4: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/widgetTimeline.test.ts`
  - Expected: PASS. If the "10:00 change" expectation needs the exact point, check it against the `+60_000`. The test asks for 10:00 exactly, so either make the test expect `10:01` or drop the offset and compare with `<`. **Rule:** the stop's own time is when it starts; it stays "next" until one minute after. Update the test's expected point to `2026-11-20T10:01:00Z` and ledger the ruling.

- [ ] **Step 5: Commit.**

```bash
git add utils/widgetTimeline.ts __tests__/utils/widgetTimeline.test.ts
git commit -m "feat(widget): pure view and 48-hour timeline shared by iPhone and Android"
```

---

### Task 6: Widget data — snapshot, storage and the bridge module

**Files:**
- Create: `modules/widget-bridge/expo-module.config.json`, `modules/widget-bridge/index.ts`, `modules/widget-bridge/ios/WidgetBridge.podspec`, `modules/widget-bridge/ios/WidgetBridgeModule.swift`
- Create: `services/widgetData.ts`
- Create: `hooks/useWidgetSync.ts`
- Modify: `app/(tabs)/_layout.tsx` (mount the hook)

**Interfaces:**
- Consumes: `widgetTimeline`, `WidgetInput` (Task 5).
- Produces:
  - `WIDGET_GROUP = 'group.com.supernovatravel.app'`
  - `writeWidget(input: WidgetInput, coverUrl: string | null): Promise<void>` (never throws)
  - iOS: the native module `WidgetBridge.setEntries(json: string)`, `WidgetBridge.saveImage(url: string, key: string): Promise<boolean>`, `WidgetBridge.reload()`.
  - Android: entries are stored in AsyncStorage under `widget:entries`, and `requestWidgetUpdate` from `react-native-android-widget` is called (Task 8 defines the widget name `NextUp`).

- [ ] **Step 1: The Expo module.** Follow `modules/add-pass-button`.
  - `expo-module.config.json`: `{ "platforms": ["apple"], "apple": { "modules": ["WidgetBridgeModule"] } }`.
  - **Podspec:** same as `AddPassButton.podspec` with the name `WidgetBridge`, frameworks `'WidgetKit'`, and `platforms { :ios => '15.1' }`.
  - **`WidgetBridgeModule.swift`:**

```swift
import ExpoModulesCore
import WidgetKit

/// Hands the widget its precomputed entries (utils/widgetTimeline) through the App Group (spec 2026-11-12).
public class WidgetBridgeModule: Module {
  static let group = "group.com.supernovatravel.app"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("setEntries") { (json: String) in
      UserDefaults(suiteName: WidgetBridgeModule.group)?.set(json, forKey: "entries")
    }

    AsyncFunction("saveImage") { (url: String, key: String) -> Bool in
      guard let u = URL(string: url),
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WidgetBridgeModule.group),
            let data = try? Data(contentsOf: u) else { return false }
      return (try? data.write(to: dir.appendingPathComponent("\(key).jpg"))) != nil
    }

    Function("reload") {
      if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    }
  }
}
```

  - **`index.ts`:** the same registry check as add-pass-button. If the native module is missing, export a no-op object:

```ts
import { requireNativeModule } from 'expo';

type Bridge = { setEntries(json: string): void; saveImage(url: string, key: string): Promise<boolean>; reload(): void };
const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
/** iPhone widget bridge (modules/widget-bridge/ios); a no-op in builds without it (Android, Expo Go, older builds). */
export const WidgetBridge: Bridge = registry?.WidgetBridge
  ? requireNativeModule<Bridge>('WidgetBridge')
  : { setEntries: () => {}, saveImage: async () => false, reload: () => {} };
```

- [ ] **Step 2: Write `services/widgetData.ts`:**

```ts
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetBridge } from '@/modules/widget-bridge';
import { widgetTimeline, type WidgetInput } from '@/utils/widgetTimeline';

export const WIDGET_GROUP = 'group.com.supernovatravel.app';

/** Writes the widget's next 48 h for both platforms (spec 2026-11-12). Never throws; nothing leaves the phone. */
export async function writeWidget(input: WidgetInput, coverUrl: string | null): Promise<void> {
  try {
    if (Platform.OS === 'ios' && coverUrl && input.trip?.coverKey) await WidgetBridge.saveImage(coverUrl, input.trip.coverKey);
    const entries = widgetTimeline(input, Date.now());
    const json = JSON.stringify(entries);
    if (Platform.OS === 'ios') { WidgetBridge.setEntries(json); WidgetBridge.reload(); return; }
    await AsyncStorage.setItem('widget:entries', json);
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { NextUpWidget } = await import('@/widgets/NextUpWidget');
    await requestWidgetUpdate({ widgetName: 'NextUp', renderWidget: () => NextUpWidget({ entries }) });
  } catch { /* the widget keeps its last entries */ }
}
```

  `@/widgets/NextUpWidget` comes from Task 8. Until then, keep the Android branch behind `Platform.OS === 'android'` and add it in Task 8. For this task, write only the iOS path and the AsyncStorage write, and ledger it.

- [ ] **Step 3: Write `hooks/useWidgetSync.ts`.** Mount it once in `app/(tabs)/_layout.tsx` next to `useFlightLiveActivity`. It builds a `WidgetInput` from data the app already loads:
  - **Trips:** use the same trip list Home uses (`homeTrips(trips, today)`). The lead is `h.today ?? h.next`.
  - **Days and stops:** for the lead trip, `useTrip(lead?.id)` gives days with activities. Map today and tomorrow (`dayDateFor(tripSpan(lead).start, dayNumber)`) to `{ date, city, stops: activities.map((a) => ({ title: a.title, time: stopTime(a) ?? null, visited: !!a.visited })), weather: null }`. Use the app's existing stop-time helper `utils/stopTime`, and the city name by `destinationIndex`.
  - **Flight:** from `useBoardingPasses()`, the soonest pass with `departureTime` in the next 24 h and status not `cancelled`/`completed`. `departLocal` uses the airport-clock helper `BoardingPassCard` uses (`utils/airportTime`). `route = "${origin} → ${destination}"`. `status = statusLine` if present.
  - **Wish city:** `topSavedCity(saves)?.city ?? null`, as Home's nudge.
  - **Cover:** `coverKey = "cover-${trip.id}"`, `coverUrl = trip.coverImageUrl` (key-less `photoUri` only; skip any URL containing `key=`).
  - **When:** call `writeWidget` when the computed input changes (`useEffect` on a `JSON.stringify(input)` memo) and when the app returns to the foreground (`AppState` `active`), so the 48 h window rolls forward.

- [ ] **Step 4: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "widget|useWidgetSync" | head`
  - Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add modules/widget-bridge services/widgetData.ts hooks/useWidgetSync.ts "app/(tabs)/_layout.tsx"
git commit -m "feat(widget): snapshot from the app's own data, written for the widget (iOS App Group bridge)"
```

---

### Task 7: iPhone widget (WidgetKit)

**Files:**
- Modify: `package.json` (add `@bacons/apple-targets@^5`), `app.json` (plugin + App Group entitlement)
- Create: `targets/widget/expo-target.config.js`, `targets/widget/NextUpWidget.swift`, `targets/widget/Info.plist` (if the plugin needs it)

- [ ] **Step 1: Install and configure.**
  - Run `npx expo install @bacons/apple-targets`.
  - In `app.json`:
    - add `"@bacons/apple-targets"` to `plugins`;
    - add `"entitlements": { "com.apple.security.application-groups": ["group.com.supernovatravel.app"] }` under `expo.ios` (merge with any existing `entitlements`).
  - Create `targets/widget/expo-target.config.js`:

```js
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  name: 'Supernova',
  deploymentTarget: '17.0',
  entitlements: { 'com.apple.security.application-groups': ['group.com.supernovatravel.app'] },
});
```

- [ ] **Step 2: Write `targets/widget/NextUpWidget.swift`:**

```swift
import WidgetKit
import SwiftUI

/// Supernova's Home Screen widget (spec 2026-11-12): shows the precomputed entries the app writes to the App Group
/// (utils/widgetTimeline) — flight day, trip day, countdown, or plan your next trip. No network.
struct WView: Codable { let kind: String; let eyebrow: String; let title: String; let detail: String?; let second: String?; let url: String; let imageKey: String? }
struct WEntryJSON: Codable { let at: Double; let view: WView }
struct NextUpEntry: TimelineEntry { let date: Date; let view: WView }

let group = "group.com.supernovatravel.app"
let placeholderView = WView(kind: "empty", eyebrow: "SUPERNOVA", title: "Plan your next trip", detail: nil, second: nil, url: "supernova://create", imageKey: nil)

func loadEntries() -> [NextUpEntry] {
  guard let json = UserDefaults(suiteName: group)?.string(forKey: "entries"),
        let data = json.data(using: .utf8),
        let list = try? JSONDecoder().decode([WEntryJSON].self, from: data), !list.isEmpty else {
    return [NextUpEntry(date: Date(), view: placeholderView)]
  }
  let now = Date()
  let entries = list.map { NextUpEntry(date: Date(timeIntervalSince1970: $0.at / 1000), view: $0.view) }
  // Start from the entry in effect now, so the widget never shows a stale past moment.
  let current = entries.last(where: { $0.date <= now }) ?? entries[0]
  return [NextUpEntry(date: now, view: current.view)] + entries.filter { $0.date > now }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> NextUpEntry { NextUpEntry(date: Date(), view: placeholderView) }
  func getSnapshot(in context: Context, completion: @escaping (NextUpEntry) -> Void) { completion(loadEntries()[0]) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NextUpEntry>) -> Void) {
    completion(Timeline(entries: loadEntries(), policy: .atEnd))
  }
}

struct NextUpView: View {
  @Environment(\.widgetFamily) var family
  let entry: NextUpEntry
  var image: UIImage? {
    guard let key = entry.view.imageKey,
          let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    return UIImage(contentsOfFile: dir.appendingPathComponent("\(key).jpg").path)
  }
  var body: some View {
    let v = entry.view
    VStack(alignment: .leading, spacing: 4) {
      Text(v.eyebrow).font(.system(size: 11, weight: .semibold)).tracking(0.9).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
      Spacer(minLength: 0)
      Text(v.title).font(.system(size: family == .systemSmall ? 17 : 20, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
      if let d = v.detail { Text(d).font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.9)).lineLimit(1) }
      if family != .systemSmall, let s = v.second { Text(s).font(.system(size: 13)).foregroundStyle(.white.opacity(0.75)).lineLimit(1) }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: v.url))
    .containerBackground(for: .widget) {
      ZStack {
        LinearGradient(colors: [Color(red: 0.10, green: 0.06, blue: 0.21), Color(red: 0.06, green: 0.04, blue: 0.16)], startPoint: .topLeading, endPoint: .bottomTrailing)
        if let img = image { Image(uiImage: img).resizable().scaledToFill(); LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom) }
      }
    }
  }
}

@main
struct NextUpWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextUp", provider: Provider()) { entry in NextUpView(entry: entry) }
      .configurationDisplayName("Next up")
      .description("Your next flight, today's next stop, or the countdown to your trip.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
```

  The always-dark background is a deliberate design choice: a travel ticket–like card, like `BoardingPassCard`. Ledger it as a ruling.

- [ ] **Step 3: Validate the config (no native build on this Mac).**
  - Run: `npx expo config --type introspect --json > /tmp/cfg.json 2>&1; grep -c "group.com.supernovatravel.app" /tmp/cfg.json`
  - Expected: ≥ 1 (the entitlement made it into the resolved config). If `introspect` isn't supported, use `npx expo config --json`.
  - The real check is the EAS iOS build after the plan.

- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json app.json targets/widget
git commit -m "feat(widget): iPhone Home Screen widget (WidgetKit via apple-targets, App Group)"
```

---

### Task 8: Android widget

**Files:**
- Modify: `package.json` (add `react-native-android-widget@^0.26`), `app.json` (plugin config), `index` / app entry (register the task handler)
- Create: `widgets/NextUpWidget.tsx`, `widgets/widgetTaskHandler.tsx`
- Modify: `services/widgetData.ts` (the Android branch, per Task 6's note)

- [ ] **Step 1: Install and configure.**
  - Run `npx expo install react-native-android-widget`.
  - Add the plugin to `app.json`, per the library's README for its current version:

```json
["react-native-android-widget", { "widgets": [{ "name": "NextUp", "label": "Next up", "description": "Your next flight, today's next stop, or the countdown to your trip.", "minWidth": "110dp", "minHeight": "110dp", "targetCellWidth": 2, "targetCellHeight": 2, "updatePeriodMillis": 1800000, "resizeMode": "horizontal|vertical" }] }]
```

- [ ] **Step 2: Write `widgets/NextUpWidget.tsx`.** Use the library's primitives (`FlexWidget`, `TextWidget`; check the README for the current names).
  - It takes `entries: { at: number; view: WidgetView }[]`, picks the view in effect now (the last entry with `at <= Date.now()`, else the first), and renders the same layout as the iPhone widget:
    - eyebrow: 11, tracked, white 75%;
    - title: 17–20, semibold, white;
    - detail: 13;
    - second line: 13, 75%;
    - background `#1a1035`, radius 16, padding 14.
  - `clickAction: 'OPEN_URI'`, `clickActionData: { uri: view.url }`.

- [ ] **Step 3: Write `widgets/widgetTaskHandler.tsx`.** On `WIDGET_ADDED`, `WIDGET_UPDATE` and `WIDGET_RESIZED`, read `AsyncStorage.getItem('widget:entries')` (try/catch → `[]`) and `props.renderWidget(<NextUpWidget entries={entries} />)`. Register it at app start per the README (`registerWidgetTaskHandler(widgetTaskHandler)` in the entry file, Android only).

- [ ] **Step 4: Finish the Android branch** in `services/widgetData.ts`, as written in Task 6 Step 2.

- [ ] **Step 5: Typecheck, lint, config check.**
  - Run: `npx tsc --noEmit -p . && npx expo config --json | grep -c "NextUp"`
  - Expected: clean; ≥ 1.

- [ ] **Step 6: Commit.**

```bash
git add package.json package-lock.json app.json widgets services/widgetData.ts
git commit -m "feat(widget): Android Home Screen widget (react-native-android-widget)"
```

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md.** Add a bullet after "Trip extras":

  "**Smart packing, holidays, widget** (spec `2026-11-12-packing-holidays-widget-design.md`):
  - **Packing suggestions:** `utils/packingSuggestions.ts`, shown on `app/trip/packing.tsx` via `components/packing/PackingSuggestions`. Forecast via `useTripForecasts`, season by hemisphere, stop keywords, plugs vs home, length; capped at 8; dismissals per trip on the phone; new lists are seeded with them.
  - **Public holidays:** `utils/holidays.ts`, `services/holidays.ts` (Nager.Date, country + year only, cached 90 days), `hooks/useHoliday`, `components/ui/HolidayLine`, on DayTimeline's `notice` and Home's Today card; credited in Settings → About.
  - **Home Screen widget:** iPhone WidgetKit in `targets/widget/` (`@bacons/apple-targets`) and Android `widgets/` (`react-native-android-widget`). Both draw precomputed entries from pure `utils/widgetTimeline.ts` (flight within 6 h → trip day → countdown → plan), written by `hooks/useWidgetSync` → `services/widgetData.ts`: iOS through `modules/widget-bridge` into App Group `group.com.supernovatravel.app`, Android via AsyncStorage `widget:entries` + `requestWidgetUpdate`.
  - **Release:** native, so a store build + version bump. The first iOS build with the App Group may need the owner's interactive `eas build` to sync the profile."

- [ ] **Step 2: Full suite, then commit.**
  - Run: `npx jest 2>&1 | grep -E "^Tests:" && npx tsc --noEmit -p .`
  - Expected: all pass.

```bash
git add CLAUDE.md
git commit -m "docs: smart packing, holidays, Home Screen widget"
```

---

## After the tasks

- **Final review:** a fresh reviewer over the branch, with this plan's Review Focus.
- **Owner's steps:**
  1. Merge.
  2. Deploy Hosting (privacy line).
  3. Bump the version for the release build; the widget is native.
  4. Run an iOS test build, possibly interactively for the App Group, plus an Android internal build.
  5. Test the widget on phones: add it, check each state, tap through.
