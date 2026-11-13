# Trip extras (Before you go, eSIMs, trains between cities) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a "Before you go" country sheet (plugs vs home, money, tipping, emergency, driving, tap water) with Airalo eSIM links, a Home line for eSIMs before international trips, and Omio "Find trains & buses" links on multi-city legs with nothing booked. Free, zero running cost.

**Architecture:** pure rules in `utils/beforeYouGo.ts`, `utils/esim.ts`, `utils/trainLinks.ts` and `utils/homeRegion.ts`, plus `utils/partnerLinks.ts` for affiliate link templates. Static data lives in `constants/countryInfo.ts` and `constants/omioCities.ts`. Three UI pieces use them:
- `components/trip/BeforeYouGoSheet.tsx`, opened from a chip on the trip page;
- a link in `CitySection`'s Getting here;
- `components/home/EsimLine.tsx` under Home's lead trip card.

No server changes.

**Tech Stack:** Expo / React Native, expo-router, AsyncStorage, Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-11-12-trip-extras-design.md`

## Global Constraints

**Who sees what**
- Free for everyone.
- Upcoming and current trips only; past trips never show any of it. An undated trip counts as upcoming (the `tourCities` rule).
- Members only (owner + accepted collaborators).

**Home and countries**
- Home is the phone's locale region. A country is international when it differs from home. With no region, every trip country counts as international.
- Trip countries are `destination.countryCode`, then each `additionalDestinations[].countryCode`, in order, upper-cased, de-duplicated, empties dropped.

**Links**
- Links carry only place or country names, our partner tags and the `supernova-app` campaign.
- No server, no pushes, no new cost.
- Links work untagged until the affiliate IDs exist. Affiliate tagging comes from build settings, as a template (see Task 2).

**Before you go sheet**
- The chip shows when the trip is upcoming or current, the viewer is a member, and at least one trip country is international.
- One section per international country, in trip order.
- Row order: plugs → money → tipping → emergency → driving → tap water → eSIM.
- A missing field hides its row.
- Plug copy:
  - no shared type: "Bring an adapter — {home} plugs don't fit."
  - some shared: "Your plugs fit some sockets."
  - same set: "Same plugs as home."
  - voltage differs (100–127 V vs 220–240 V, or the reverse): add "{voltage} V: check your chargers say 100–240 V."
- Emergency taps open `tel:`.

**eSIMs**
- The row reads "Get an eSIM for {country name} · Airalo" when the country has an `airaloSlug`. The link is `https://www.airalo.com/{airaloSlug}`.
- The Home line reads "Staying connected? eSIMs for {first international country}" plus " and N more".
- When it shows: the trip starts in 0–7 days or is under way, the viewer is a member, at least one international country has a slug, and it isn't dismissed (`esimLineDismissed:{tripId}`, on the phone).
- Tapping it opens the trip with the sheet open.

**Trains**
- On city index ≥ 1, when that city's Getting here is empty, both cities have coordinates, and the leg is ≤ 800 km: "Find trains & buses {prev} → {city} · Omio".
- With both Omio IDs: `https://www.omio.com/?departure_fk={id}&arrival_fk={id}`. Otherwise `https://www.omio.com/`. No dates are sent.
- `constants/omioCities.ts` starts empty.

**Edge cases**
- Domestic-only trip: no chip and no eSIM line, but train links still show.
- Unknown country: its section shows the name only (plus eSIM if possible). All countries unknown means no chip.
- Undated trip: no eSIM line.

**UI rules**
- `useTheme` colors.
- Phosphor icons, no emoji.
- 44 pt targets.
- `useCallback` handlers.
- Haptics: Light on nav and select.
- Sentence case.

**Testing:** pure tests only. `npx jest <path>`; whole suite `npx jest`; `npx tsc --noEmit -p .`; `npx expo lint`.

## Review Focus

1. **Trip country codes lowercase, missing or repeated** (e.g. `'cz'`, `null`, CZ twice): upper-case, drop, de-duplicate. Pinned in Task 1 (`tripCountries` test).
2. **Phone region unknown** (locale `"en"` with no region): every country counts as international and plug advice falls back to types only, not "Same plugs as home". Pinned in Task 1.
3. **Plug sets partly overlapping** (US → China: A,C,I vs A,B): "Your plugs fit some sockets", not "adapter" or "same". Pinned in Task 1.
4. **A leg with a city missing coordinates:** no train link, rather than a wrong distance. Pinned in Task 3.
5. **An undated trip, or a trip starting in 8+ days:** no eSIM line. A trip dismissed on this phone stays hidden. Pinned in Task 2.

---

### Task 1: Country table, home region and Before you go rules (pure)

**Files:**
- Create: `constants/countryInfo.ts`
- Create: `utils/homeRegion.ts`
- Create: `utils/beforeYouGo.ts`
- Test: `__tests__/utils/beforeYouGo.test.ts`, `__tests__/constants/countryInfo.test.ts`

**Interfaces:**
- Produces:
  - `export interface CountryInfo { name: string; plugs: string[]; voltage: number; currency: { code: string; name: string }; emergency: string; drive: 'left' | 'right'; tipping?: string; tapWater?: 'safe' | 'bottled'; airaloSlug?: string }`
  - `export const COUNTRY_INFO: Record<string, CountryInfo>`, keyed by ISO alpha-2, upper-case.
  - `homeRegion(locale: string | null | undefined): string | null` (`'en-US'` → `'US'`, `'en'` → null).
  - `type CountryTrip = { destination: { countryCode?: string | null }; additionalDestinations?: { countryCode?: string | null }[] }`
  - `tripCountries(trip: CountryTrip): string[]`
  - `internationalCountries(countries: string[], home: string | null): string[]`
  - `plugAdvice(home: string | null, dest: string): string | null`
  - `type CountryRow = { kind: 'plugs' | 'money' | 'tipping' | 'emergency' | 'driving' | 'water'; label: string; value: string; tel?: string }`
  - `countryRows(code: string, home: string | null): { code: string; name: string; rows: CountryRow[] }`
  - `showBeforeYouGo(trip: CountryTrip & SpanTrip, today: string, isMember: boolean, home: string | null): boolean`

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/beforeYouGo.test.ts`:

```ts
import { tripCountries, internationalCountries, plugAdvice, countryRows, showBeforeYouGo } from '@/utils/beforeYouGo';
import { homeRegion } from '@/utils/homeRegion';

const trip = (codes: (string | null)[], over: object = {}) => ({
  destination: { countryCode: codes[0] }, additionalDestinations: codes.slice(1).map((c) => ({ countryCode: c })), startDay: '2026-11-18', startDate: null, endDate: null, ...over,
}) as never;

describe('homeRegion', () => {
  it('reads the region from a locale, null without one (review focus 2)', () => {
    expect(homeRegion('en-US')).toBe('US');
    expect(homeRegion('de_AT')).toBe('AT');
    expect(homeRegion('en')).toBeNull();
    expect(homeRegion(undefined)).toBeNull();
  });
});

describe('tripCountries (review focus 1)', () => {
  it('in trip order, upper-cased, de-duplicated, empties dropped', () => {
    expect(tripCountries(trip(['cz', 'HU', null, 'CZ', 'at']))).toEqual(['CZ', 'HU', 'AT']);
  });
});

describe('internationalCountries', () => {
  it('drops home; with no home every country counts', () => {
    expect(internationalCountries(['US', 'MX'], 'US')).toEqual(['MX']);
    expect(internationalCountries(['US', 'MX'], null)).toEqual(['US', 'MX']);
  });
});

describe('plugAdvice', () => {
  it('US → Czechia: adapter, and a voltage warning', () => {
    expect(plugAdvice('US', 'CZ')).toBe('Type C / E · 230 V. Bring an adapter — US plugs don\'t fit. 230 V: check your chargers say 100–240 V.');
  });
  it('UK → Ireland: same plugs, no warning', () => {
    expect(plugAdvice('GB', 'IE')).toBe('Type G · 230 V. Same plugs as home.');
  });
  it('US → China: some sockets fit (review focus 3)', () => {
    expect(plugAdvice('US', 'CN')).toContain('Your plugs fit some sockets.');
  });
  it('unknown home: types and voltage only (review focus 2)', () => {
    expect(plugAdvice(null, 'CZ')).toBe('Type C / E · 230 V');
  });
  it('unknown destination: nothing', () => {
    expect(plugAdvice('US', 'ZZ')).toBeNull();
  });
});

describe('countryRows', () => {
  it('rows in order with an emergency number to dial', () => {
    const s = countryRows('CZ', 'US');
    expect(s.name).toBe('Czechia');
    expect(s.rows.map((r) => r.kind)).toEqual(['plugs', 'money', 'tipping', 'emergency', 'driving', 'water']);
    expect(s.rows.find((r) => r.kind === 'emergency')).toMatchObject({ value: '112', tel: '112' });
  });
  it('an unknown country shows its code as the name and no rows', () => {
    expect(countryRows('ZZ', 'US')).toEqual({ code: 'ZZ', name: 'ZZ', rows: [] });
  });
});

describe('showBeforeYouGo', () => {
  const today = '2026-11-12';
  it('members on upcoming international trips', () => {
    expect(showBeforeYouGo(trip(['CZ']), today, true, 'US')).toBe(true);
    expect(showBeforeYouGo(trip(['CZ']), today, false, 'US')).toBe(false);
  });
  it('not for domestic-only trips, past trips, or all-unknown countries', () => {
    expect(showBeforeYouGo(trip(['US']), today, true, 'US')).toBe(false);
    expect(showBeforeYouGo(trip(['CZ'], { startDay: '2026-10-01' }), today, true, 'US')).toBe(false);
    expect(showBeforeYouGo(trip(['ZZ']), today, true, 'US')).toBe(false);
  });
  it('an undated trip counts as upcoming', () => {
    expect(showBeforeYouGo(trip(['CZ'], { startDay: null }), today, true, 'US')).toBe(true);
  });
});
```

Create `__tests__/constants/countryInfo.test.ts`:

```ts
import { COUNTRY_INFO } from '@/constants/countryInfo';
import catalog from '../../data/destinations.json';

describe('COUNTRY_INFO', () => {
  const entries = Object.entries(COUNTRY_INFO);
  it('covers the world (≥ 190 countries) with every hard fact valid', () => {
    expect(entries.length).toBeGreaterThanOrEqual(190);
    for (const [code, c] of entries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.plugs.length).toBeGreaterThan(0);
      for (const p of c.plugs) expect(p).toMatch(/^[A-O]$/);
      expect([100, 110, 115, 120, 127, 220, 230, 240]).toContain(c.voltage);
      expect(c.currency.code).toMatch(/^[A-Z]{3}$/);
      expect(c.emergency).toMatch(/\d/);
      expect(['left', 'right']).toContain(c.drive);
      if (c.tapWater) expect(['safe', 'bottled']).toContain(c.tapWater);
      if (c.airaloSlug) expect(c.airaloSlug).toMatch(/^[a-z-]+-esim$/);
    }
  });
  it('every catalog country has tipping, tap water and an Airalo page', () => {
    const codes = [...new Set((catalog as { countryCode: string }[]).map((e) => e.countryCode))];
    for (const code of codes) {
      expect(COUNTRY_INFO[code]).toBeDefined();
      expect(COUNTRY_INFO[code].tipping).toBeTruthy();
      expect(COUNTRY_INFO[code].tapWater).toBeTruthy();
      expect(COUNTRY_INFO[code].airaloSlug).toBeTruthy();
    }
  });
  it('spot checks known facts', () => {
    expect(COUNTRY_INFO.US).toMatchObject({ plugs: ['A', 'B'], voltage: 120, drive: 'right', currency: { code: 'USD' }, emergency: '911' });
    expect(COUNTRY_INFO.GB).toMatchObject({ plugs: ['G'], voltage: 230, drive: 'left', currency: { code: 'GBP' }, emergency: '999' });
    expect(COUNTRY_INFO.JP).toMatchObject({ plugs: ['A', 'B'], voltage: 100, drive: 'left', currency: { code: 'JPY' } });
    expect(COUNTRY_INFO.CZ).toMatchObject({ name: 'Czechia', plugs: ['C', 'E'], voltage: 230, drive: 'right', currency: { code: 'CZK' }, emergency: '112' });
    expect(COUNTRY_INFO.AU).toMatchObject({ plugs: ['I'], voltage: 230, drive: 'left', currency: { code: 'AUD' }, emergency: '000' });
    expect(COUNTRY_INFO.IN).toMatchObject({ voltage: 230, drive: 'left', currency: { code: 'INR' }, emergency: '112' });
    expect(COUNTRY_INFO.CN.plugs).toEqual(expect.arrayContaining(['A', 'C', 'I']));
    expect(COUNTRY_INFO.IE).toMatchObject({ plugs: ['G'], drive: 'left', currency: { code: 'EUR' } });
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/beforeYouGo.test.ts __tests__/constants/countryInfo.test.ts`
  - Expected: FAIL (modules missing).

- [ ] **Step 3: Write `utils/homeRegion.ts`:**

```ts
/** The phone's home region from its locale (spec 2026-11-12): 'en-US' → 'US'; no region → null. */
export function homeRegion(locale: string | null | undefined): string | null {
  const part = (locale ?? '').split(/[-_]/)[1];
  return part && /^[A-Za-z]{2}$/.test(part) ? part.toUpperCase() : null;
}
```

- [ ] **Step 4: Write `constants/countryInfo.ts`.**
  - Start with the header comment and type below, then **one entry per ISO-3166 country (≥ 190)**.
  - The hard facts (plugs, voltage, currency, emergency, drive) are well-known reference data: IEC World Plugs, ISO 4217, national emergency numbers. Every country gets them.
  - `tipping` (≤ 50 chars, plain advice like "Round up or ~10% at restaurants") and `tapWater` are required for every catalog country (`data/destinations.json` `countryCode`s) and otherwise only where confident.
  - `airaloSlug` is `{country-name-kebab}-esim` in Airalo's form: `czech-republic-esim`, `united-kingdom-esim`, `united-states-esim`, `japan-esim`. It's required for catalog countries, wherever Airalo sells the country.
  - Use common English names: "Czechia", "United Kingdom", "United States".
  - Keys in alphabetical order.

```ts
/**
 * Before you go (spec 2026-11-12): per-country travel basics, built in so it works offline and costs nothing.
 * Hard facts (plugs, voltage, currency, emergency, drive) for every country; tipping and tap water only where
 * confident (every catalog country), never guessed. airaloSlug = Airalo's country page path.
 */
export interface CountryInfo {
  name: string;
  /** IEC plug letters, e.g. ['C', 'E']. */
  plugs: string[];
  voltage: number;
  currency: { code: string; name: string };
  /** The general emergency number travellers should dial. */
  emergency: string;
  drive: 'left' | 'right';
  tipping?: string;
  tapWater?: 'safe' | 'bottled';
  airaloSlug?: string;
}

export const COUNTRY_INFO: Record<string, CountryInfo> = {
  // … one line per country, e.g.:
  CZ: { name: 'Czechia', plugs: ['C', 'E'], voltage: 230, currency: { code: 'CZK', name: 'Czech koruna' }, emergency: '112', drive: 'right', tipping: 'Round up or ~10% at restaurants', tapWater: 'safe', airaloSlug: 'czech-republic-esim' },
  US: { name: 'United States', plugs: ['A', 'B'], voltage: 120, currency: { code: 'USD', name: 'US dollar' }, emergency: '911', drive: 'right', tipping: '18–20% at restaurants, $1–2 a drink', tapWater: 'safe', airaloSlug: 'united-states-esim' },
};
```

- [ ] **Step 5: Write `utils/beforeYouGo.ts`:**

```ts
import { COUNTRY_INFO } from '@/constants/countryInfo';
import { tripSpan, type SpanTrip } from '@/utils/homeState';

/** Before you go (spec 2026-11-12). Pure. */
export type CountryTrip = { destination: { countryCode?: string | null }; additionalDestinations?: { countryCode?: string | null }[] };
export type CountryRow = { kind: 'plugs' | 'money' | 'tipping' | 'emergency' | 'driving' | 'water'; label: string; value: string; tel?: string };

export function tripCountries(trip: CountryTrip): string[] {
  const out: string[] = [];
  for (const c of [trip.destination, ...(trip.additionalDestinations ?? [])]) {
    const code = (c?.countryCode ?? '').trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export const internationalCountries = (countries: string[], home: string | null) => countries.filter((c) => c !== home);

const lowVoltage = (v: number) => v <= 127;

export function plugAdvice(home: string | null, dest: string): string | null {
  const d = COUNTRY_INFO[dest];
  if (!d) return null;
  const base = `Type ${d.plugs.join(' / ')} · ${d.voltage} V`;
  const h = home ? COUNTRY_INFO[home] : undefined;
  if (!h) return base;
  const shared = d.plugs.filter((p) => h.plugs.includes(p));
  const same = shared.length === d.plugs.length && shared.length === h.plugs.length;
  const fit = same ? 'Same plugs as home.' : shared.length > 0 ? 'Your plugs fit some sockets.' : `Bring an adapter — ${home} plugs don't fit.`;
  const volts = lowVoltage(h.voltage) !== lowVoltage(d.voltage) ? ` ${d.voltage} V: check your chargers say 100–240 V.` : '';
  return `${base}. ${fit}${volts}`;
}

export function countryRows(code: string, home: string | null): { code: string; name: string; rows: CountryRow[] } {
  const c = COUNTRY_INFO[code];
  if (!c) return { code, name: code, rows: [] };
  const rows: CountryRow[] = [];
  const plugs = plugAdvice(home, code);
  if (plugs) rows.push({ kind: 'plugs', label: 'Plugs', value: plugs });
  rows.push({ kind: 'money', label: 'Money', value: `${c.currency.name} (${c.currency.code})` });
  if (c.tipping) rows.push({ kind: 'tipping', label: 'Tipping', value: c.tipping });
  rows.push({ kind: 'emergency', label: 'Emergency', value: c.emergency, tel: c.emergency.replace(/[^\d+]/g, '') });
  rows.push({ kind: 'driving', label: 'Driving', value: c.drive === 'left' ? 'On the left' : 'On the right' });
  if (c.tapWater) rows.push({ kind: 'water', label: 'Tap water', value: c.tapWater === 'safe' ? 'Safe to drink' : 'Drink bottled' });
  return { code, name: c.name, rows };
}

/** Upcoming or current (undated = upcoming), members only, at least one known international country. */
export function showBeforeYouGo(trip: CountryTrip & SpanTrip, today: string, isMember: boolean, home: string | null): boolean {
  if (!isMember) return false;
  const { end } = tripSpan(trip);
  if (end && end < today) return false;
  return internationalCountries(tripCountries(trip), home).some((c) => COUNTRY_INFO[c]);
}
```

If `emergency` has several numbers (e.g. "110 police · 119 ambulance"), `tel` takes the first number. Use `c.emergency.match(/[\d+]+/)?.[0]` instead of the replace, and add a test: `countryRows('JP', 'US')` emergency `tel` is `'110'`.

- [ ] **Step 6: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/beforeYouGo.test.ts __tests__/constants/countryInfo.test.ts`
  - Expected: PASS. If a spot check fails, the table entry is wrong. Fix the data, never the test.

- [ ] **Step 7: Commit.**

```bash
git add constants/countryInfo.ts utils/homeRegion.ts utils/beforeYouGo.ts __tests__/utils/beforeYouGo.test.ts __tests__/constants/countryInfo.test.ts
git commit -m "feat(before-you-go): country table and rules"
```

---

### Task 2: Partner link templates and eSIM rules (pure)

**Files:**
- Create: `utils/partnerLinks.ts`
- Create: `utils/esim.ts`
- Test: `__tests__/utils/esim.test.ts`

**Interfaces:**
- Consumes: `COUNTRY_INFO`, `tripCountries`, `internationalCountries`, `CountryTrip` (Task 1); `tripSpan`, `SpanTrip` (`utils/homeState`).
- Produces:
  - `type LinkTemplates = { omio: string | null; airalo: string | null }`
  - `linkTemplatesFromEnv(env): LinkTemplates`, reading `EXPO_PUBLIC_OMIO_LINK_TEMPLATE` and `EXPO_PUBLIC_AIRALO_LINK_TEMPLATE`.
  - `applyTemplate(url: string, template: string | null): string`
  - `airaloUrl(code: string, templates: LinkTemplates): string | null`
  - `esimHomeLine(trip: CountryTrip & SpanTrip & { id: string }, today: string, isMember: boolean, home: string | null, dismissed: boolean): { label: string; firstCountry: string } | null`

How templates work: an affiliate network gives either a wrapper (`https://tp.media/r?marker=123&p=XXXX&u={url}`) or parameters to append (`{raw}&partner=abc`). A template holds `{url}` (the URL-encoded target) or `{raw}` (the target as is). With no template, the plain URL is used. Signing up then needs only a build setting, no code change.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/esim.test.ts`:

```ts
import { applyTemplate, linkTemplatesFromEnv } from '@/utils/partnerLinks';
import { airaloUrl, esimHomeLine } from '@/utils/esim';

const none = { omio: null, airalo: null };
const trip = (codes: string[], startDay: string | null) => ({
  id: 't1', destination: { countryCode: codes[0] }, additionalDestinations: codes.slice(1).map((c) => ({ countryCode: c })), startDay, startDate: null, endDate: null,
}) as never;

describe('partner link templates', () => {
  it('no template: the plain URL', () => {
    expect(applyTemplate('https://www.airalo.com/japan-esim', null)).toBe('https://www.airalo.com/japan-esim');
  });
  it('{url} wraps the encoded target; {raw} appends to it', () => {
    expect(applyTemplate('https://www.airalo.com/japan-esim', 'https://tp.media/r?p=1&u={url}')).toBe('https://tp.media/r?p=1&u=https%3A%2F%2Fwww.airalo.com%2Fjapan-esim');
    expect(applyTemplate('https://www.airalo.com/japan-esim', '{raw}?ref=abc')).toBe('https://www.airalo.com/japan-esim?ref=abc');
  });
  it('reads the templates from build settings, blank = none', () => {
    expect(linkTemplatesFromEnv({ EXPO_PUBLIC_AIRALO_LINK_TEMPLATE: ' x{url} ', EXPO_PUBLIC_OMIO_LINK_TEMPLATE: '' })).toEqual({ airalo: 'x{url}', omio: null });
  });
});

describe('airaloUrl', () => {
  it('the country page, or null where Airalo has none', () => {
    expect(airaloUrl('CZ', none)).toBe('https://www.airalo.com/czech-republic-esim');
    expect(airaloUrl('ZZ', none)).toBeNull();
  });
});

describe('esimHomeLine (review focus 5)', () => {
  const today = '2026-11-12';
  it('in the 7 days before an international trip: the first country + how many more', () => {
    expect(esimHomeLine(trip(['CZ', 'HU', 'AT', 'DE', 'NL'], '2026-11-18'), today, true, 'US', false)).toEqual({ label: 'Staying connected? eSIMs for Czechia and 4 more', firstCountry: 'CZ' });
    expect(esimHomeLine(trip(['JP'], '2026-11-19'), today, true, 'US', false)?.label).toBe('Staying connected? eSIMs for Japan');
  });
  it('also while the trip is under way', () => {
    expect(esimHomeLine({ ...trip(['JP'], '2026-11-10'), endDate: { toDate: () => new Date('2026-11-20T12:00:00Z') } } as never, today, true, 'US', false)).not.toBeNull();
  });
  it('nothing 8+ days out, undated, dismissed, domestic, or for non-members', () => {
    expect(esimHomeLine(trip(['JP'], '2026-11-20'), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], null), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], '2026-11-15'), today, true, 'US', true)).toBeNull();
    expect(esimHomeLine(trip(['US'], '2026-11-15'), today, true, 'US', false)).toBeNull();
    expect(esimHomeLine(trip(['JP'], '2026-11-15'), today, false, 'US', false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/esim.test.ts`
  - Expected: FAIL (modules missing).

- [ ] **Step 3: Write `utils/partnerLinks.ts`:**

```ts
/**
 * Affiliate tagging for Omio and Airalo (spec 2026-11-12) as build-setting templates, so signing up needs no code:
 * `{url}` = the target URL-encoded (a network's redirect wrapper), `{raw}` = the target as is (append parameters).
 * No template → the plain link (works, earns nothing). Pure.
 */
export type LinkTemplates = { omio: string | null; airalo: string | null };

export function linkTemplatesFromEnv(env: Record<string, string | undefined>): LinkTemplates {
  const v = (k: string) => (env[k] && env[k]!.trim() ? env[k]!.trim() : null);
  return { omio: v('EXPO_PUBLIC_OMIO_LINK_TEMPLATE'), airalo: v('EXPO_PUBLIC_AIRALO_LINK_TEMPLATE') };
}

export function applyTemplate(url: string, template: string | null): string {
  if (!template) return url;
  if (template.includes('{url}')) return template.replace('{url}', encodeURIComponent(url));
  if (template.includes('{raw}')) return template.replace('{raw}', url);
  return url;
}
```

- [ ] **Step 4: Write `utils/esim.ts`:**

```ts
import { COUNTRY_INFO } from '@/constants/countryInfo';
import { internationalCountries, tripCountries, type CountryTrip } from '@/utils/beforeYouGo';
import { tripSpan, type SpanTrip } from '@/utils/homeState';
import { addDays } from '@/utils/pastTrip';
import { applyTemplate, type LinkTemplates } from '@/utils/partnerLinks';

/** eSIMs (spec 2026-11-12): Airalo's country page, and Home's line in the week before an international trip. Pure. */
export function airaloUrl(code: string, templates: LinkTemplates): string | null {
  const slug = COUNTRY_INFO[code]?.airaloSlug;
  return slug ? applyTemplate(`https://www.airalo.com/${slug}`, templates.airalo) : null;
}

export function esimHomeLine(
  trip: CountryTrip & SpanTrip & { id: string }, today: string, isMember: boolean, home: string | null, dismissed: boolean,
): { label: string; firstCountry: string } | null {
  if (!isMember || dismissed) return null;
  const { start, end } = tripSpan(trip);
  if (!start || start > addDays(today, 7) || (end ?? start) < today) return null;
  const sold = internationalCountries(tripCountries(trip), home).filter((c) => COUNTRY_INFO[c]?.airaloSlug);
  if (sold.length === 0) return null;
  const more = sold.length - 1;
  return { label: `Staying connected? eSIMs for ${COUNTRY_INFO[sold[0]].name}${more > 0 ? ` and ${more} more` : ''}`, firstCountry: sold[0] };
}
```

Check `addDays` in `utils/pastTrip` takes `(day: string, n: number) => string` (calendar strings). It's used that way by `utils/tripTours.ts`.

- [ ] **Step 5: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/esim.test.ts`
  - Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add utils/partnerLinks.ts utils/esim.ts __tests__/utils/esim.test.ts
git commit -m "feat(esim): Airalo links, Home line rules, partner link templates"
```

---

### Task 3: Train links (pure)

**Files:**
- Create: `constants/omioCities.ts`
- Create: `utils/trainLinks.ts`
- Test: `__tests__/utils/trainLinks.test.ts`

**Interfaces:**
- Consumes: `applyTemplate`, `LinkTemplates` (Task 2); `haversineMeters` (`utils/tripRoutes`).
- Produces:
  - `export const OMIO_CITY_IDS: Record<string, number>`, keyed by folded city name.
  - `foldCity(name: string): string`
  - `omioUrl(from: string, to: string, templates: LinkTemplates, ids?: Record<string, number>): string`
  - `type LegCity = { name: string; lat: number | null; lng: number | null }`
  - `trainLink(prev: LegCity, city: LegCity, gettingHereCount: number, templates: LinkTemplates, ids?: Record<string, number>): { label: string; url: string } | null`
  - `TRAIN_MAX_KM = 800`

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/trainLinks.test.ts`:

```ts
import { foldCity, omioUrl, trainLink, TRAIN_MAX_KM } from '@/utils/trainLinks';

const none = { omio: null, airalo: null };
const prague = { name: 'Prague', lat: 50.0755, lng: 14.4378 };
const budapest = { name: 'Budapest', lat: 47.4979, lng: 19.0402 };
const tokyo = { name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

describe('foldCity', () => {
  it('folds case and accents and drops the country part', () => {
    expect(foldCity('Köln')).toBe('koln');
    expect(foldCity('Prague, Czechia')).toBe('prague');
  });
});

describe('omioUrl', () => {
  it('both cities known: a prefilled search, no dates', () => {
    expect(omioUrl('Prague', 'Budapest', none, { prague: 1, budapest: 2 })).toBe('https://www.omio.com/?departure_fk=1&arrival_fk=2');
  });
  it('a city unknown (or the table empty): Omio home', () => {
    expect(omioUrl('Prague', 'Budapest', none, { prague: 1 })).toBe('https://www.omio.com/');
    expect(omioUrl('Prague', 'Budapest', none)).toBe('https://www.omio.com/');
  });
  it('applies the affiliate template', () => {
    expect(omioUrl('Prague', 'Budapest', { omio: '{raw}?mcid=9', airalo: null })).toBe('https://www.omio.com/?mcid=9');
  });
});

describe('trainLink', () => {
  it('a short leg with nothing booked gets a link', () => {
    expect(trainLink(prague, budapest, 0, none)).toEqual({ label: 'Find trains & buses Prague → Budapest · Omio', url: 'https://www.omio.com/' });
  });
  it('nothing when the leg is booked or too far', () => {
    expect(trainLink(prague, budapest, 1, none)).toBeNull();
    expect(trainLink(prague, tokyo, 0, none)).toBeNull();
    expect(TRAIN_MAX_KM).toBe(800);
  });
  it('nothing when a city has no coordinates (review focus 4)', () => {
    expect(trainLink({ name: 'Prague', lat: null, lng: null }, budapest, 0, none)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/trainLinks.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Write `constants/omioCities.ts`:**

```ts
/**
 * Omio's own city ids for prefilled train searches (spec 2026-11-12), from Omio's "Deep link Creator" file in the
 * affiliate help centre. Keyed by foldCity(name). Empty until the owner has the affiliate account: links then open
 * Omio's search page. Add the 89 catalog destinations first.
 */
export const OMIO_CITY_IDS: Record<string, number> = {};
```

- [ ] **Step 4: Write `utils/trainLinks.ts`:**

```ts
import { OMIO_CITY_IDS } from '@/constants/omioCities';
import { applyTemplate, type LinkTemplates } from '@/utils/partnerLinks';
import { haversineMeters } from '@/utils/tripRoutes';

/** Trains & buses between a trip's cities (spec 2026-11-12): Omio, only for short legs with nothing booked. Pure. */
export const TRAIN_MAX_KM = 800;
export type LegCity = { name: string; lat: number | null; lng: number | null };

export const foldCity = (name: string) =>
  name.split(',')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function omioUrl(from: string, to: string, templates: LinkTemplates, ids: Record<string, number> = OMIO_CITY_IDS): string {
  const a = ids[foldCity(from)], b = ids[foldCity(to)];
  const url = a && b ? `https://www.omio.com/?departure_fk=${a}&arrival_fk=${b}` : 'https://www.omio.com/';
  return applyTemplate(url, templates.omio);
}

export function trainLink(prev: LegCity, city: LegCity, gettingHereCount: number, templates: LinkTemplates, ids?: Record<string, number>) {
  if (gettingHereCount > 0) return null;
  if (prev.lat == null || prev.lng == null || city.lat == null || city.lng == null) return null;
  const km = haversineMeters({ lat: prev.lat, lng: prev.lng }, { lat: city.lat, lng: city.lng }) / 1000;
  if (km > TRAIN_MAX_KM) return null;
  return { label: `Find trains & buses ${prev.name} → ${city.name} · Omio`, url: omioUrl(prev.name, city.name, templates, ids) };
}
```

`foldCity('Köln')`: NFD splits ö into o + U+0308, which the range removes, giving 'koln'.

- [ ] **Step 5: Run the tests to verify they pass.**
  - Run: `npx jest __tests__/utils/trainLinks.test.ts`
  - Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add constants/omioCities.ts utils/trainLinks.ts __tests__/utils/trainLinks.test.ts
git commit -m "feat(trains): Omio links for short legs with nothing booked"
```

---

### Task 4: Before you go sheet and chip

**Files:**
- Create: `components/trip/BeforeYouGoSheet.tsx`
- Modify: `app/trip/[id].tsx` (the chip beside Packing, the sheet, and `?beforeYouGo=1` opening it)

**Interfaces:**
- Consumes: `countryRows`, `internationalCountries`, `tripCountries`, `showBeforeYouGo` (Task 1); `homeRegion` (Task 1); `airaloUrl`, `linkTemplatesFromEnv` (Task 2).
- Produces: `BeforeYouGoSheet({ visible, countries, home, onClose })`, where `countries` is an ordered `string[]`.

- [ ] **Step 1: Write the sheet.** `components/trip/BeforeYouGoSheet.tsx` follows the app's existing bottom sheets: an RN `Modal` with `presentationStyle={isLarge ? 'pageSheet' : undefined}` like `CalendarSheet`. Copy its header, close button, spring and theme usage.
  - **Title:** "Before you go". Under it, for each code in `countries`, `countryRows(code, home)`.
  - **Section header:** an eyebrow with the country name upper-cased, 11 pt tracked and muted.
  - **Rows:** label (muted, 13 pt) and value (15 pt).
  - **Icons, from `phosphor-react-native`, duotone, 16 pt, `colors.text.secondary`:** `Plug` (plugs), `Money` (money), `HandCoins` (tipping), `Phone` (emergency), `Car` (driving), `Drop` (water).
  - **The emergency row** is a `TouchableOpacity`: `Linking.openURL('tel:' + row.tel)`, haptic Light, `accessibilityRole="link"`, `accessibilityLabel` `Call ${row.value}`.
  - **The eSIM row,** when `airaloUrl(code, templates)` is non-null: a link row with `SimCard` duotone and the text "Get an eSIM for {name} · Airalo". It opens with `Linking.openURL`, haptic Light.
  - **The list:** a `ScrollView` with `contentContainerStyle` padding 20 and `gap` 24 between countries.
  - **Templates:** read once at module level, `const TEMPLATES = linkTemplatesFromEnv(process.env)`.

  Accept a `scrollToFirst` prop only if trivial. Opening from Home lands at the top anyway, so the first country shows first.

- [ ] **Step 2: Add the chip.** In `app/trip/[id].tsx`:
  - Compute:

```ts
const home = useMemo(() => homeRegion(Intl.DateTimeFormat().resolvedOptions().locale), []);
const byCountries = useMemo(() => (trip ? internationalCountries(tripCountries(trip), home) : []), [trip, home]);
const showByg = !!trip && showBeforeYouGo(trip, toCalendarDate(new Date()), isOwner || isCollaborator, home);
const [bygVisible, setBygVisible] = useState(params.beforeYouGo === '1');
```

  - The `params` are the screen's existing `useLocalSearchParams`. Add `beforeYouGo?: string` to its type.
  - Right after the Packing chip, add a chip like it: icon `GlobeHemisphereWest` duotone 13, text "Before you go", `accessibilityLabel="Before you go: country tips"`, `onPress` with Light haptic → `setBygVisible(true)`. It renders when `showByg`.
  - Render `<BeforeYouGoSheet visible={bygVisible && showByg} countries={byCountries} home={home} onClose={closeByg} />` next to the other sheets, with `closeByg = useCallback(() => setBygVisible(false), [])`.
  - Import `toCalendarDate` from `@/utils/calendarDate` if it isn't already imported.

- [ ] **Step 3: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "BeforeYouGoSheet|trip/\[id\]" | head`
  - Expected: no TS errors and no new lint findings in these files.

- [ ] **Step 4: Commit.**

```bash
git add components/trip/BeforeYouGoSheet.tsx "app/trip/[id].tsx"
git commit -m "feat(before-you-go): sheet and trip chip"
```

---

### Task 5: Train link in Getting here

**Files:**
- Modify: `components/trip/CitySection.tsx`
- Modify: `app/trip/[id].tsx` (pass `trainLink` per city)

**Interfaces:**
- Consumes: `trainLink`, `LegCity` (Task 3); `linkTemplatesFromEnv` (Task 2).
- Produces: `CitySectionProps.train?: { label: string; url: string } | null`.

- [ ] **Step 1: Pass the train link.** In `app/trip/[id].tsx`, where each `<CitySection>` is rendered (it passes `arriving={perCity[ci]?.arriving ?? []}`), add:

```tsx
train={ci > 0 && (isOwner || isCollaborator) && tripActive
  ? trainLink(cityPoint(ci - 1), cityPoint(ci), perCity[ci]?.arriving.length ?? 0, PARTNER_TEMPLATES)
  : null}
```

  - `cityPoint(i)` returns `{ name: destinationNames[i], lat, lng }` from `trip.destination` (i = 0) or `trip.additionalDestinations[i - 1]`, with `lat`/`lng` `?? null`.
  - `tripActive` is the trip being upcoming or current: `const { end } = tripSpan(trip); !end || end >= today`. Reuse a value the screen already computes for tours if there is one; otherwise compute it once with `useMemo`.
  - Add `const PARTNER_TEMPLATES = linkTemplatesFromEnv(process.env);` at module level.

- [ ] **Step 2: Render it in `CitySection`.** In the GETTING HERE block, when `p.arriving.length === 0` and `p.train` is set, render a link row **above** "Add how you're getting here":
  - a `Train` duotone 16 icon and `p.train.label`;
  - `onPress` with Light haptic → `Linking.openURL(p.train.url)`;
  - `accessibilityRole="link"`.

  Reuse `styles.link` and `styles.linkText`. Wrap both rows in `styles.links`, as the STAYING block does.

- [ ] **Step 3: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "CitySection|trip/\[id\]" | head`
  - Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add components/trip/CitySection.tsx "app/trip/[id].tsx"
git commit -m "feat(trains): Find trains & buses in Getting here"
```

---

### Task 6: eSIM line on Home

**Files:**
- Create: `components/home/EsimLine.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `esimHomeLine` (Task 2); `homeRegion` (Task 1).
- Produces: `EsimLine({ trip })`, which renders nothing when `esimHomeLine` is null.

- [ ] **Step 1: Write `components/home/EsimLine.tsx`:**
  - **Dismissal state:** a hook like `WishlistNudge`'s `useNudgeDismissed`, with key `esimLineDismissed:{trip.id}`. Copy its AsyncStorage pattern, with try/catch so a failed read counts as not dismissed.
  - **Computing the line:** `const line = dismissed === null ? null : esimHomeLine(trip, toCalendarDate(new Date()), true, homeRegion(locale), dismissed)`. Home trips are the viewer's own or joined trips, so `isMember = true`.
  - **The row:** a `SimCard` duotone 16 icon, `line.label` (13–15 pt, `colors.text.primary`) and a right-aligned ✕ (`X` bold 14, 44 pt target, `accessibilityLabel="Hide eSIM suggestion"`).
  - **Tapping the row:** Light haptic, then `router.push({ pathname: '/trip/[id]', params: { id: trip.id, beforeYouGo: '1' } })`.
  - **Tapping ✕:** Light haptic, then dismiss.
  - **Styling:** card background `colors.background.card`, radius `BorderRadius.xl`, padding `Spacing['4']`, `minHeight: 44`.

- [ ] **Step 2: Place it on Home.** In `app/(tabs)/index.tsx`, render `{leadTrip ? <EsimLine trip={leadTrip} /> : null}` right after the TodayCard / NextTripCard block. Use `h.next` when no trip is under way. Check which variable holds the current or next trip; the file has `leadTrip` and `h.next`. Use `h.today ? leadTrip : h.next`.

- [ ] **Step 3: Typecheck and lint.**
  - Run: `npx tsc --noEmit -p . && npx expo lint 2>&1 | grep -A2 -E "EsimLine|tabs\)/index" | head`
  - Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add components/home/EsimLine.tsx "app/(tabs)/index.tsx"
git commit -m "feat(esim): line on Home in the week before an international trip"
```

---

### Task 7: Docs, privacy policy and settings

**Files:**
- Modify: `CLAUDE.md`
- Modify: `hosting/privacy.html`
- Modify: `.env.local.example`

- [ ] **Step 1: CLAUDE.md.**
  - **Environment table:** add rows for `EXPO_PUBLIC_OMIO_LINK_TEMPLATE` and `EXPO_PUBLIC_AIRALO_LINK_TEMPLATE`, both client and **optional**. The text explains: an affiliate link template, `{url}` = encoded target, `{raw}` = target as is; unset links work but earn nothing.
  - **New bullet after the "Tours and tickets" bullet:** "**Trip extras** (spec `2026-11-12-trip-extras-design.md`; pure `utils/beforeYouGo.ts`, `utils/esim.ts`, `utils/trainLinks.ts`, `utils/partnerLinks.ts`, `utils/homeRegion.ts`; data `constants/countryInfo.ts`, `constants/omioCities.ts`) — members, upcoming/current trips, free:
    - a **Before you go** chip → `BeforeYouGoSheet` per international country (home = phone's locale region): plugs vs home, money, tipping, emergency (`tel:`), driving, tap water, Airalo eSIM;
    - Home's `EsimLine` in the 7 days before / during an international trip (dismissed per trip on the phone, `esimLineDismissed:{id}`);
    - **Find trains & buses** (Omio) in a city's Getting here when nothing is booked and the leg is ≤ 800 km.

    Fill `OMIO_CITY_IDS` from Omio's Deep link Creator file for prefilled searches. Affiliate tags are build-setting templates, so signing up needs no code — but a new build."

- [ ] **Step 2: Privacy policy.** In `hosting/privacy.html`, find where GetYourGuide/Viator are named. Add Omio and Airalo with the same "links only — we send only the place or country name" wording. Deploying Hosting is the owner's step.

- [ ] **Step 3: `.env.local.example`.** Add `EXPO_PUBLIC_OMIO_LINK_TEMPLATE=` and `EXPO_PUBLIC_AIRALO_LINK_TEMPLATE=`, each with a one-line comment.

- [ ] **Step 4: Full suite, then commit.**
  - Run: `npx jest 2>&1 | grep -E "^Tests:" && npx tsc --noEmit -p .`
  - Expected: all pass.

```bash
git add CLAUDE.md hosting/privacy.html .env.local.example
git commit -m "docs: trip extras — env templates, privacy policy, CLAUDE.md"
```

---

## After the tasks

- **Final review:** a fresh reviewer over `git merge-base main HEAD..HEAD`, with this plan's Review Focus.
- **Owner's steps:**
  - merge;
  - deploy Hosting (privacy policy);
  - an iOS test build;
  - affiliate sign-ups, then add the templates to EAS build settings and fill `OMIO_CITY_IDS`, which needs a build to take effect.
