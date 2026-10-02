import { disambiguatePlaceName, selectionName } from '@/utils/placeName';

const comps = (admin1Long: string, admin1Short: string, country = 'US') => [
  { longText: admin1Long, shortText: admin1Short, types: ['administrative_area_level_1', 'political'] },
  { longText: 'United States', shortText: country, types: ['country', 'political'] },
];

describe('disambiguatePlaceName', () => {
  it('keeps Washington DC from reading as Washington State', () => {
    expect(disambiguatePlaceName('Washington', comps('District of Columbia', 'DC'), 'locality')).toBe('Washington, DC');
  });
  it('does the same for a city named after its own state', () => {
    expect(disambiguatePlaceName('New York', comps('New York', 'NY'), 'locality')).toBe('New York, NY');
  });
  it('leaves the state itself alone', () => {
    expect(disambiguatePlaceName('Washington', comps('Washington', 'WA'), 'administrative_area_level_1')).toBe('Washington');
  });
  it('leaves ordinary names alone', () => {
    expect(disambiguatePlaceName('Seattle', comps('Washington', 'WA'), 'locality')).toBe('Seattle');
    expect(disambiguatePlaceName('Paris', [{ longText: 'France', shortText: 'FR', types: ['country'] }], 'locality')).toBe('Paris');
  });
  it('without a type, still separates a city from a differently named state (DC)', () => {
    expect(disambiguatePlaceName('Washington', comps('District of Columbia', 'DC'), undefined)).toBe('Washington, DC');
    expect(disambiguatePlaceName('Washington', comps('Washington', 'WA'), undefined)).toBe('Washington');
  });
  it('tolerates missing components', () => {
    expect(disambiguatePlaceName('Washington', undefined, 'locality')).toBe('Washington');
  });
});

describe('selectionName', () => {
  // The real Places (New) responses for "Washington DC", 2026-10-01.
  const dcComponents = [
    { longText: 'Washington', shortText: 'Washington', types: ['locality', 'political'] },
    { longText: 'District of Columbia', shortText: 'District of Columbia', types: ['administrative_area_level_2', 'political'] },
    { longText: 'District of Columbia', shortText: 'DC', types: ['administrative_area_level_1', 'political'] },
    { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
  ];
  it('keeps the suggestion the traveler tapped — "Washington D.C.", not details\' "Washington"', () => {
    expect(selectionName('Washington', 'Washington D.C.', dcComponents, undefined)).toBe('Washington D.C.');
  });
  it('still disambiguates when the tapped text itself is a state name (New York City)', () => {
    const ny = [
      { longText: 'New York', shortText: 'NY', types: ['administrative_area_level_1'] },
      { longText: 'United States', shortText: 'US', types: ['country'] },
    ];
    expect(selectionName('New York', 'New York', ny, 'locality')).toBe('New York, NY');
  });
  it('falls back to the details name when there is no tapped text', () => {
    expect(selectionName('Washington', undefined, dcComponents, undefined)).toBe('Washington, DC');
    expect(selectionName('Lisbon', '  ', [], 'locality')).toBe('Lisbon');
  });
});
