import { packingSuggestions, packingCovered, type PackDay } from '@/utils/packingSuggestions';

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
    const s = packingSuggestions({ ...base, days: [day({ weather: { kind: 'sun', max: 31, min: 20 } as never }), day({ weather: { kind: 'sun', max: 8, min: 2 } as never })] });
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

describe('similar items count as packed (final review I3: "Passport" next to "Passport / ID")', () => {
  it('matches the templates\' near-identical labels', () => {
    expect(packingCovered('Passport', ['Passport / ID'])).toBe(true);
    expect(packingCovered('Plug adapter (type C / E)', ['Power adapter'])).toBe(true);
    expect(packingCovered('Warm coat', ['Winter coat'])).toBe(true);
    expect(packingCovered('Warm layers', ['Thermal layers'])).toBe(true);
    expect(packingCovered('Walking shoes', ['Hiking boots'])).toBe(true);
    expect(packingCovered('Swimsuit', ['Sun hat'])).toBe(false);
  });
  it('a suggestion already covered by a template item is not shown', () => {
    const s = packingSuggestions({ ...base, existing: ['Passport / ID', 'Power adapter'], days: [day()] });
    expect(labels(s)).not.toContain('Passport');
    expect(labels(s).some((l) => l.startsWith('Plug adapter'))).toBe(false);
  });
});
