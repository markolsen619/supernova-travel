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
