// __tests__/utils/airportTime.test.ts
import { airportZone, flightClock, flightInstant, instantFromPickers, pickerDateFor } from '@/utils/airportTime';

describe('airportZone (app)', () => {
  it('same table as the server', () => {
    expect(airportZone('AMS')).toBe('Europe/Amsterdam');
    expect(airportZone('zzz')).toBeNull();
  });
});

describe('flightClock — a stored UTC departure as printed on the pass', () => {
  it('on the airport\'s clock', () => {
    expect(flightClock('2026-11-18T15:10:00.000Z', 'AMS')).toEqual({ date: '2026-11-18', time: '16:10' });
    expect(flightClock('2026-12-05T08:55:00.000Z', 'SAN')).toEqual({ date: '2026-12-05', time: '00:55' });
  });
  it('the local date, even when UTC is already the next day', () => {
    expect(flightClock('2026-11-02T03:30:00.000Z', 'LAX')).toEqual({ date: '2026-11-01', time: '19:30' });
  });
  it('bad time gives null', () => {
    expect(flightClock('nope', 'AMS')).toBeNull();
  });
});

describe('flightInstant — a time typed from the pass, saved as the real moment', () => {
  it('reads the typed time on the departure airport\'s clock', () => {
    expect(flightInstant('2026-11-18', '16:10', 'AMS')).toBe('2026-11-18T15:10:00.000Z');
    expect(flightInstant('2026-07-01', '17:10', 'AMS')).toBe('2026-07-01T15:10:00.000Z');
    expect(flightInstant('2026-11-01', '06:00', 'DEL')).toBe('2026-11-01T00:30:00.000Z');
  });
  it('round-trips with flightClock across a daylight-saving change', () => {
    for (const iso of ['2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-10-25T02:30:00.000Z', '2026-10-24T23:30:00.000Z']) {
      const c = flightClock(iso, 'AMS')!;
      expect(flightInstant(c.date, c.time, 'AMS')).toBe(iso);
    }
  });
  it('the hour that happens twice when clocks go back resolves to one of its two real moments', () => {
    // 02:30 in Amsterdam on 2026-10-25 is both 00:30Z (summer time) and 01:30Z (winter time).
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(flightInstant('2026-10-25', '02:30', 'AMS'));
  });
  it('bad input gives null', () => {
    expect(flightInstant('2026-11-18', '25:00', 'AMS')).toBeNull();
    expect(flightInstant('soon', '10:00', 'AMS')).toBeNull();
  });
});

describe('the pass form (date and time pickers)', () => {
  it('opens on the time printed on the pass', () => {
    const d = pickerDateFor('2026-11-18T15:10:00.000Z', 'AMS')!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 18, 16, 10]);
  });
  it('saves what the pickers show as that time at the departure airport', () => {
    const day = new Date(2026, 10, 18, 0, 0);
    const time = new Date(2000, 0, 1, 16, 10);
    expect(instantFromPickers(day, time, 'AMS')).toBe('2026-11-18T15:10:00.000Z');
  });
  it('open then save without changes keeps the exact moment', () => {
    const d = pickerDateFor('2026-12-05T08:55:00.000Z', 'AMS')!;
    expect(instantFromPickers(d, d, 'AMS')).toBe('2026-12-05T08:55:00.000Z');
  });
});
