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
  it('skips a script subtag and extensions (final review I3: zh-Hans-CN read as no region)', () => {
    expect(homeRegion('zh-Hans-CN')).toBe('CN');
    expect(homeRegion('sr-Latn-RS')).toBe('RS');
    expect(homeRegion('en-US-u-ca-gregory')).toBe('US');
    expect(homeRegion('es-419')).toBeNull();
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
  it('with several numbers, a tap calls the first (Japan: 110 police)', () => {
    expect(countryRows('JP', 'US').rows.find((r) => r.kind === 'emergency')).toMatchObject({ value: '110 police · 119 ambulance', tel: '110' });
  });
  it('a hyphenated number dials in full (final review I1: Marshall Islands 625-8666 dialled 625)', () => {
    expect(countryRows('MH', 'US').rows.find((r) => r.kind === 'emergency')?.tel).toBe('6258666');
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
