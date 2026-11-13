import { widgetView, widgetTimeline, widgetFlightPass, type WidgetInput } from '@/utils/widgetTimeline';

// Local wall-clock times (the widget runs on the phone's clock). Setting process.env.TZ inside a Jest test file has no
// effect, so build local instants instead: '2026-11-20T08:00:00Z' here means 08:00 on the machine's clock.
const at = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)!; return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(); };
const trip = {
  id: 't1', title: 'Prague, Budapest & more', start: '2026-11-18', end: '2026-12-05', coverKey: 'cover-t1',
  days: [
    { date: '2026-11-20', city: 'Prague', weather: '9° cloudy', stops: [
      { title: 'Prague Castle', time: '10:00', visited: false }, { title: 'Lunch at Lokál', time: null, visited: false }, { title: 'Charles Bridge', time: '18:00', visited: false }] },
    { date: '2026-11-21', city: 'Prague', weather: null, stops: [{ title: 'Train to Budapest', time: '09:19', visited: false }] },
  ],
};
const base: WidgetInput = { trip, flight: null, wishCity: null };

describe('widgetView', () => {
  it('before a trip: countdown', () => {
    const v = widgetView(base, at('2026-11-12T12:00:00Z'));
    expect(v).toMatchObject({ kind: 'countdown', eyebrow: '6 DAYS', title: 'Prague, Budapest & more', url: 'supernova://trip/t1', imageKey: 'cover-t1' });
  });
  it('during a trip: next stop by time; untimed stops follow the last passed timed one', () => {
    expect(widgetView(base, at('2026-11-20T08:00:00Z'))).toMatchObject({ kind: 'trip', eyebrow: 'DAY 3 · PRAGUE', title: 'Prague Castle', detail: '10:00', second: 'Then Lunch at Lokál' });
    expect(widgetView(base, at('2026-11-20T11:00:00Z'))).toMatchObject({ title: 'Lunch at Lokál', detail: null, second: 'Then Charles Bridge' });
  });
  it("today's stops done: tomorrow's first", () => {
    expect(widgetView(base, at('2026-11-20T19:00:00Z'))).toMatchObject({ kind: 'trip', title: 'Tomorrow: Train to Budapest', detail: '09:19' });
  });
  it('flight within 6 h wins, until an hour after departure (review focus 4)', () => {
    const flight = { id: 'p1', flightNumber: 'KL1357', route: 'AMS → PRG', departMs: at('2026-11-20T15:10:00Z'), departLocal: '16:10', gate: 'D8', status: null };
    expect(widgetView({ ...base, flight }, at('2026-11-20T09:00:00Z')).kind).toBe('trip'); // 6 h 10 min before: not yet
    expect(widgetView({ ...base, flight }, at('2026-11-20T09:10:00Z')).kind).toBe('flight'); // exactly 6 h before
    expect(widgetView({ ...base, flight }, at('2026-11-20T10:00:00Z'))).toMatchObject({ kind: 'flight', title: 'KL1357', detail: 'Departs 16:10 · Gate D8', url: 'supernova://boarding-pass/p1' });
    expect(widgetView({ ...base, flight }, at('2026-11-20T16:30:00Z')).kind).toBe('trip');
  });
  it('nothing planned: invite to plan, with the top saved city', () => {
    expect(widgetView({ trip: null, flight: null, wishCity: 'Lisbon' }, at('2026-11-12T12:00:00Z'))).toMatchObject({ kind: 'empty', title: 'Plan your next trip', detail: 'Lisbon is on your wish list', url: 'supernova://create' });
  });
});

describe('widgetTimeline', () => {
  it('starts now, changes as stops pass and at midnight (review focus 3)', () => {
    const entries = widgetTimeline(base, at('2026-11-20T08:00:00Z'));
    expect(entries[0].at).toBe(at('2026-11-20T08:00:00Z'));
    expect(entries.map((e) => e.at)).toEqual(expect.arrayContaining([at('2026-11-20T10:01:00Z'), at('2026-11-21T00:00:00Z')]));
    expect(entries.every((e, i) => i === 0 || e.at > entries[i - 1].at)).toBe(true);
    expect(entries[entries.length - 1].at).toBeLessThanOrEqual(at('2026-11-22T08:00:00Z'));
  });
  it('merges consecutive identical views', () => {
    const entries = widgetTimeline({ trip: null, flight: null, wishCity: null }, at('2026-11-12T12:00:00Z'));
    expect(entries).toHaveLength(1);
  });
});

describe('widgetFlightPass', () => {
  const now = at('2026-11-20T08:00:00Z');
  const p = (id: string, iso: string, status = 'upcoming', delayMinutes = 0) => ({ id, departureTime: new Date(at(iso)).toISOString(), status, delayMinutes });
  it('the soonest flight still ahead (or just departed) within 48 h', () => {
    expect(widgetFlightPass([p('b', '2026-11-21T09:00:00Z'), p('a', '2026-11-20T15:00:00Z')], now)?.id).toBe('a');
  });
  it('skips cancelled and completed flights, and ones more than 48 h out or over an hour gone', () => {
    expect(widgetFlightPass([p('a', '2026-11-20T15:00:00Z', 'cancelled'), p('c', '2026-11-20T10:00:00Z', 'completed')], now)).toBeNull();
    expect(widgetFlightPass([p('far', '2026-11-23T09:00:00Z')], now)).toBeNull();
    expect(widgetFlightPass([p('gone', '2026-11-20T06:30:00Z')], now)).toBeNull();
  });
  it('a delay moves the departure', () => {
    expect(widgetFlightPass([p('late', '2026-11-20T06:30:00Z', 'upcoming', 120)], now)?.id).toBe('late');
  });
});
