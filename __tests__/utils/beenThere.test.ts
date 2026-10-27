import { beenThereSummary } from '@/utils/beenThere';

describe('beenThereSummary', () => {
  it('counts trips and distinct countries across every city', () => {
    expect(beenThereSummary([
      { destination: { countryCode: 'PT' }, additionalDestinations: [{ countryCode: 'ES' }] },
      { destination: { countryCode: 'pt' } },
      { destination: { countryCode: null } },
    ])).toBe('3 trips · 2 countries');
  });
  it('singular and empty', () => {
    expect(beenThereSummary([{ destination: { countryCode: 'GB' } }])).toBe('1 trip · 1 country');
    expect(beenThereSummary([{ destination: null }])).toBe('1 trip');
    expect(beenThereSummary([])).toBe('');
  });
});
