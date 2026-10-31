import {
  isLongTrip, highlightsActive, stripDayPrefix, cityFromQueries, momentStop, arrivalTravel, tripChapters,
  type HStop, type HDay,
} from '@/utils/highlights';

const TOKYO = { lat: 35.68, lng: 139.76 };
const OSAKA = { lat: 34.69, lng: 135.50 };
let n = 0;
const stop = (dayId: string, at: { lat: number; lng: number }, q: string | null = null, type = 'activity', title = 'Stop'): HStop => {
  const id = `s${n++}`;
  return { id, dayId, lat: at.lat, lng: at.lng, searchQuery: q, route: { id, type: type as never, title, notes: '', lat: at.lat, lng: at.lng } };
};
const near = (p: { lat: number; lng: number }, d: number) => ({ lat: p.lat + d, lng: p.lng + d });
const day = (id: string, dayNumber: number, title: string | null = null, savedCity: string | null = null): HDay => ({ id, dayNumber, title, savedCity });

describe('isLongTrip / highlightsActive', () => {
  it('5+ days or 26+ stops', () => {
    expect(isLongTrip(4, 25)).toBe(false);
    expect(isLongTrip(5, 3)).toBe(true);
    expect(isLongTrip(2, 26)).toBe(true);
  });
  it('planned view only', () => {
    expect(highlightsActive({ long: true, actualMode: false })).toBe(true);
    expect(highlightsActive({ long: true, actualMode: true })).toBe(false);
    expect(highlightsActive({ long: false, actualMode: false })).toBe(false);
  });
});

describe('labels and names', () => {
  it('strips Day N prefixes', () => {
    expect(stripDayPrefix('Day 2: Shibuya & Harajuku')).toBe('Shibuya & Harajuku');
    expect(stripDayPrefix('Day 3 – Asakusa')).toBe('Asakusa');
    expect(stripDayPrefix('Day 4')).toBeNull();
    expect(stripDayPrefix('Arrival')).toBe('Arrival');
    expect(stripDayPrefix(null)).toBeNull();
  });
  it('names a city from the stops\' search text', () => {
    expect(cityFromQueries(['Senso-ji, Tokyo', 'Ueno Park, Tokyo', 'Kyoto Station, Kyoto', null])).toBe('Tokyo');
    expect(cityFromQueries(['Somewhere, JP', 'Shop 12, 100-0001'])).toBeNull();
    expect(cityFromQueries([null, 'no comma'])).toBeNull();
  });
});

describe('momentStop / arrivalTravel', () => {
  it('picks the stop nearest the middle of the day', () => {
    const a = stop('d', near(TOKYO, 0)), b = stop('d', near(TOKYO, 0.01)), c = stop('d', near(TOKYO, 0.2));
    expect(momentStop([a, b, c])!.id).toBe(b.id);
    expect(momentStop([])).toBeNull();
  });
  it('never walks between cities; long hops fly', () => {
    const a = stop('d1', TOKYO).route, b = stop('d2', near(TOKYO, 0.005)).route;
    expect(arrivalTravel(a, b)).toBe('drive');
    expect(arrivalTravel(stop('x', TOKYO).route, stop('y', { lat: 13.75, lng: 100.5 }).route)).toBe('flight');
    expect(arrivalTravel(stop('x', TOKYO).route, stop('y', OSAKA, null, 'transport', 'Shinkansen train to Osaka').route)).toBe('train');
  });
});

describe('tripChapters', () => {
  it('one city over 8 days: one chapter, 8 moments, no arrival', () => {
    const days = Array.from({ length: 8 }, (_, i) => day(`d${i + 1}`, i + 1, `Day ${i + 1}: Area ${i + 1}`));
    const stops = days.flatMap((d, i) => [stop(d.id, near(TOKYO, i * 0.01), 'Spot, Tokyo'), stop(d.id, near(TOKYO, i * 0.01 + 0.005), 'Spot, Tokyo')]);
    const ch = tripChapters(days, stops);
    expect(ch).toHaveLength(1);
    expect(ch[0].cityName).toBe('Tokyo');
    expect(ch[0].dayNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ch[0].moments.map((m) => m.label)).toEqual(['Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area 5', 'Area 6', 'Area 7', 'Area 8']);
    expect(ch[0].arrival).toBeNull();
  });
  it('Tokyo → Osaka → Tokyo is three chapters with arrivals', () => {
    const days = [day('a', 1), day('b', 2), day('c', 3)];
    const s = [stop('a', TOKYO, 'X, Tokyo'), stop('b', OSAKA, 'Y, Osaka'), stop('c', near(TOKYO, 0.01), 'Z, Tokyo')];
    const ch = tripChapters(days, s);
    expect(ch.map((c) => c.cityName)).toEqual(['Tokyo', 'Osaka', 'Tokyo']);
    expect(ch[1].arrival?.fromStopId).toBe(s[0].id);
    expect(ch[1].arrival?.travel).not.toBe('walk');
    expect(ch[2].arrival?.fromStopId).toBe(s[1].id);
  });
  it('uses saved cities when the trip has them', () => {
    const days = [day('a', 1, null, 'Lisbon'), day('b', 2, null, 'Lisbon'), day('c', 3, null, 'Porto')];
    const s = [stop('a', { lat: 38.72, lng: -9.14 }), stop('b', { lat: 38.8, lng: -9.38 }), stop('c', { lat: 41.15, lng: -8.61 })];
    const ch = tripChapters(days, s);
    expect(ch.map((c) => [c.cityName, c.dayNumbers])).toEqual([['Lisbon', [1, 2]], ['Porto', [3]]]);
  });
  it('a day with no located stops joins the city around it and has no moment', () => {
    const days = [day('a', 1), day('b', 2), day('c', 3)];
    const s = [stop('a', TOKYO, 'X, Tokyo'), stop('c', near(TOKYO, 0.01), 'Z, Tokyo')];
    const ch = tripChapters(days, s);
    expect(ch).toHaveLength(1);
    expect(ch[0].dayNumbers).toEqual([1, 2, 3]);
    expect(ch[0].moments.map((m) => m.dayNumber)).toEqual([1, 3]);
  });
  it('plans a 30-day, 200-stop trip quickly', () => {
    const days = Array.from({ length: 30 }, (_, i) => day(`d${i}`, i + 1));
    const stops = Array.from({ length: 200 }, (_, i) => stop(`d${i % 30}`, near(i % 60 < 30 ? TOKYO : OSAKA, (i % 7) * 0.01), 'Spot, City'));
    const t = Date.now();
    tripChapters(days, stops);
    expect(Date.now() - t).toBeLessThan(100);
  });
});
