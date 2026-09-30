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
