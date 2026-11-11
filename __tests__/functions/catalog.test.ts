import { validateCatalog, type CatalogEntry } from '../../functions/src/catalog';
import catalog from '../../data/destinations.json';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  slug: 'lisbon', name: 'Lisbon', countryCode: 'PT', countryName: 'Portugal', continentChip: 'europe',
  vibes: ['food', 'culture'], popularity: 80, query: 'Lisbon, Portugal', styles: ['cultural', 'budget'], ...over,
});

describe('validateCatalog', () => {
  it('accepts a well-formed entry', () => {
    expect(validateCatalog([entry()])).toEqual([]);
  });

  it('reports duplicate slugs, bad codes, bad popularity and empty vibes', () => {
    const problems = validateCatalog([
      entry(),
      entry({ name: 'Lisbon again' }),
      entry({ slug: 'x-y', countryCode: 'PRT' }),
      entry({ slug: 'z', popularity: 0, vibes: [] }),
    ]);
    expect(problems.join('\n')).toMatch(/duplicate slug: lisbon/);
    expect(problems.join('\n')).toMatch(/x-y: countryCode/);
    expect(problems.join('\n')).toMatch(/z: popularity/);
    expect(problems.join('\n')).toMatch(/z: vibes/);
  });

  it('reports slugs that are not lowercase-hyphenated', () => {
    expect(validateCatalog([entry({ slug: 'Rio de Janeiro' })]).join()).toMatch(/slug/);
  });
});

describe('data/destinations.json', () => {
  const entries = catalog as CatalogEntry[];

  it('is valid', () => {
    expect(validateCatalog(entries)).toEqual([]);
  });

  it('has about sixty destinations, every chip with at least four', () => {
    expect(entries.length).toBeGreaterThanOrEqual(55);
    for (const chip of ['europe', 'asia', 'americas', 'africa-middle-east', 'oceania']) {
      expect(entries.filter((e) => e.continentChip === chip).length).toBeGreaterThanOrEqual(4);
    }
    for (const vibe of ['beaches', 'food', 'adventure', 'culture', 'nature', 'nightlife']) {
      expect(entries.filter((e) => e.vibes.includes(vibe as never)).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('coverage (spec 2026-11-11: few destinations in Africa, the Middle East, East Asia and South Asia)', () => {
  type Box = { sw: [number, number]; ne: [number, number] };
  const entries = catalog as (CatalogEntry & { bbox?: Box; center?: { lat: number; lng: number } })[];
  it('has the new destinations', () => {
    const slugs = new Set(entries.map((e) => e.slug));
    for (const s of ['serengeti', 'nairobi', 'victoria-falls', 'okavango-delta', 'kruger', 'essaouira', 'mauritius', 'seychelles',
      'petra', 'wadi-rum', 'abu-dhabi', 'doha', 'muscat', 'jerusalem', 'amman',
      'chengdu', 'osaka', 'beijing', 'shanghai', 'taipei', 'busan', 'hokkaido', 'guilin',
      'jaipur', 'goa', 'kathmandu', 'sri-lanka', 'maldives', 'kerala']) expect(slugs.has(s)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(89);
  });
  it('explicit boxes are city-sized and hold their centre (review focus 3)', () => {
    for (const e of entries.filter((x) => x.bbox)) {
      expect(e.bbox!.ne[0] - e.bbox!.sw[0]).toBeLessThanOrEqual(1.6);
      expect(e.bbox!.ne[1] - e.bbox!.sw[1]).toBeLessThanOrEqual(1.6);
      expect(e.center!.lng).toBeGreaterThanOrEqual(e.bbox!.sw[0]);
      expect(e.center!.lng).toBeLessThanOrEqual(e.bbox!.ne[0]);
      expect(e.center!.lat).toBeGreaterThanOrEqual(e.bbox!.sw[1]);
      expect(e.center!.lat).toBeLessThanOrEqual(e.bbox!.ne[1]);
    }
  });
});

describe('boxes cover where visitors actually go (final review)', () => {
  type Box = { sw: [number, number]; ne: [number, number] };
  const bySlug = new Map((catalog as (CatalogEntry & { bbox?: Box })[]).map((e) => [e.slug, e]));
  const holds = (slug: string, lat: number, lng: number) => {
    const b = bySlug.get(slug)!.bbox!;
    return lng >= b.sw[0] && lng <= b.ne[0] && lat >= b.sw[1] && lat <= b.ne[1];
  };
  it('Kruger includes the southern camps (Skukuza, Lower Sabie, Crocodile Bridge)', () => {
    expect(holds('kruger', -24.996, 31.592)).toBe(true);
    expect(holds('kruger', -25.12, 31.92)).toBe(true);
    expect(holds('kruger', -25.36, 31.89)).toBe(true);
  });
  it('Okavango includes Maun, its base', () => {
    expect(holds('okavango-delta', -19.98, 23.42)).toBe(true);
  });
});
