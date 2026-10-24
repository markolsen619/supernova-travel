// __tests__/functions/airportTime.test.ts
import { airportZone, zonedIso } from '../../functions/src/airportTime';

describe('airportZone', () => {
  it('knows the airport\'s zone from its code, any case', () => {
    expect(airportZone('AMS')).toBe('Europe/Amsterdam');
    expect(airportZone('san')).toBe('America/Los_Angeles');
    expect(airportZone(' nrt ')).toBe('Asia/Tokyo');
  });
  it('unknown or missing codes give null', () => {
    expect(airportZone('ZZZ')).toBeNull();
    expect(airportZone(undefined)).toBeNull();
    expect(airportZone('AMST')).toBeNull();
  });
});

describe('zonedIso', () => {
  it('the same moment written in the airport\'s local time, with its offset', () => {
    expect(zonedIso('2026-11-18T15:10:00.000Z', 'Europe/Amsterdam')).toBe('2026-11-18T16:10:00+01:00');
    expect(zonedIso('2026-07-01T15:10:00.000Z', 'Europe/Amsterdam')).toBe('2026-07-01T17:10:00+02:00');
    expect(zonedIso('2026-12-05T08:55:00.000Z', 'America/Los_Angeles')).toBe('2026-12-05T00:55:00-08:00');
    expect(zonedIso('2026-11-01T00:30:00.000Z', 'Asia/Kolkata')).toBe('2026-11-01T06:00:00+05:30');
  });
  it('crosses the date line correctly', () => {
    expect(zonedIso('2026-11-01T20:00:00.000Z', 'Pacific/Auckland')).toBe('2026-11-02T09:00:00+13:00');
  });
  it('bad input gives null', () => {
    expect(zonedIso('nonsense', 'Europe/Amsterdam')).toBeNull();
    expect(zonedIso('2026-11-18T15:10:00.000Z', 'Mars/Base')).toBeNull();
  });
});
