// __tests__/functions/flightLive.test.ts
import { parseLiveFlight, flightChanges, alertNotification, formatDelay, type LiveFlight } from '../../functions/src/flightLive';

const live = (over: Partial<LiveFlight> = {}): LiveFlight => ({ status: 'scheduled', gate: null, terminal: null, delayMinutes: null, departureLocal: null, ...over });
const NOW = 1_760_000_000_000;

describe('parseLiveFlight', () => {
  it('reads gate, terminal, delay and the local clock time', () => {
    const r = parseLiveFlight({ data: [{ flight_status: 'scheduled', departure: { gate: 'B22', terminal: '2', delay: 45, estimated: '2026-10-23T14:35:00+00:00' } }] });
    expect(r).toEqual({ kind: 'flight', flight: { status: 'scheduled', gate: 'B22', terminal: '2', delayMinutes: 45, departureLocal: '14:35' } });
  });
  it('no flight found', () => {
    expect(parseLiveFlight({ data: [] })).toEqual({ kind: 'none' });
  });
  it('spots the monthly limit', () => {
    expect(parseLiveFlight({ error: { code: 'usage_limit_reached', message: 'x' } })).toEqual({ kind: 'limit', code: 'usage_limit_reached' });
  });
  it('other errors are just no answer', () => {
    expect(parseLiveFlight({ error: { code: 'invalid_access_key' } })).toEqual({ kind: 'error', code: 'invalid_access_key' });
    expect(parseLiveFlight(null)).toEqual({ kind: 'none' });
  });
});

describe('flightChanges', () => {
  it('a new gate alerts and is saved as live', () => {
    const r = flightChanges({ status: 'upcoming', gate: 'B3' }, live({ gate: 'B22' }), NOW);
    expect(r.patch).toMatchObject({ gate: 'B22', gateSource: 'live', liveCheckedAtMs: NOW });
    expect(r.alerts).toEqual([{ kind: 'gate', gate: 'B22' }]);
  });
  it('the same gate in other case is not a change', () => {
    expect(flightChanges({ status: 'upcoming', gate: 'b22' }, live({ gate: 'B22' }), NOW).alerts).toEqual([]);
  });
  it('a gate appearing where none was saved alerts too', () => {
    expect(flightChanges({ status: 'upcoming' }, live({ gate: 'C4' }), NOW).alerts).toEqual([{ kind: 'gate', gate: 'C4' }]);
  });
  it('a terminal change is saved without an alert', () => {
    const r = flightChanges({ status: 'upcoming', terminal: '1' }, live({ terminal: '2' }), NOW);
    expect(r.patch.terminal).toBe('2');
    expect(r.alerts).toEqual([]);
  });
  it('delays alert from 15 minutes, then every further 15', () => {
    expect(flightChanges({ status: 'upcoming' }, live({ delayMinutes: 10 }), NOW).alerts).toEqual([]);
    const first = flightChanges({ status: 'upcoming' }, live({ delayMinutes: 20, departureLocal: '14:35' }), NOW);
    expect(first.alerts).toEqual([{ kind: 'delay', minutes: 20, departureLocal: '14:35' }]);
    expect(first.patch).toMatchObject({ delayMinutes: 20, liveDepartureLocal: '14:35', delayAlertedMinutes: 20 });
    expect(flightChanges({ status: 'upcoming', delayAlertedMinutes: 20 }, live({ delayMinutes: 30 }), NOW).alerts).toEqual([]);
    expect(flightChanges({ status: 'upcoming', delayAlertedMinutes: 20 }, live({ delayMinutes: 35 }), NOW).alerts).toHaveLength(1);
  });
  it('airborne becomes boarded with no alert', () => {
    const r = flightChanges({ status: 'upcoming', gate: 'B3' }, live({ status: 'active', gate: 'B9' }), NOW);
    expect(r.patch.status).toBe('boarded');
    expect(r.alerts).toEqual([]);
  });
  it('landed and cancelled alert once', () => {
    expect(flightChanges({ status: 'boarded' }, live({ status: 'landed' }), NOW)).toEqual({ patch: { liveCheckedAtMs: NOW, status: 'completed' }, alerts: [{ kind: 'landed' }] });
    expect(flightChanges({ status: 'upcoming' }, live({ status: 'cancelled', gate: 'B22' }), NOW).alerts).toEqual([{ kind: 'cancelled' }]);
    expect(flightChanges({ status: 'cancelled' }, live({ status: 'cancelled' }), NOW).alerts).toEqual([]);
  });
  it('nothing new means only the checked-at stamp', () => {
    expect(flightChanges({ status: 'upcoming', gate: 'B3' }, live({ gate: 'B3' }), NOW)).toEqual({ patch: { liveCheckedAtMs: NOW }, alerts: [] });
  });
});

describe('alertNotification', () => {
  it('gate', () => {
    expect(alertNotification({ kind: 'gate', gate: 'B22' }, 'p1', 'KL1357')).toEqual({
      notification: { type: 'flight_change', passId: 'p1', flightNumber: 'KL1357', change: 'gate', gate: 'B22' },
      push: { title: 'Gate change · KL1357', body: 'Now departing from gate B22.' },
    });
  });
  it('delay, with and without the new time', () => {
    expect(alertNotification({ kind: 'delay', minutes: 45, departureLocal: '14:35' }, 'p1', 'KL1357').push)
      .toEqual({ title: 'KL1357 is delayed', body: 'About 45 min late — now departing 14:35.' });
    expect(alertNotification({ kind: 'delay', minutes: 80, departureLocal: null }, 'p1', 'KL1357').push.body).toBe('About 1 h 20 min late.');
  });
  it('landed and cancelled keep the flight_status type older apps know', () => {
    expect(alertNotification({ kind: 'landed' }, 'p1', 'KL1357')).toEqual({
      notification: { type: 'flight_status', passId: 'p1', flightNumber: 'KL1357', status: 'completed' },
      push: { title: 'Flight update', body: 'KL1357 has landed.' },
    });
    expect(alertNotification({ kind: 'cancelled' }, 'p1', 'KL1357').notification.status).toBe('cancelled');
  });
});

describe('formatDelay', () => {
  it('minutes, hours, both', () => {
    expect(formatDelay(45)).toBe('45 min');
    expect(formatDelay(60)).toBe('1 h');
    expect(formatDelay(135)).toBe('2 h 15 min');
  });
});

describe('final review fixes', () => {
  const dep = '2026-10-23T12:00:00.000Z';
  it('a "landed" answer before the flight has even left is another day\'s flight — ignored', () => {
    const before = Date.parse(dep) - 2 * 3_600_000;
    expect(flightChanges({ status: 'upcoming', departureTime: dep }, live({ status: 'landed', gate: 'Z9' }), before))
      .toEqual({ patch: { liveCheckedAtMs: before }, alerts: [] });
  });
  it('landed after departure still counts', () => {
    const after = Date.parse(dep) + 5 * 3_600_000;
    expect(flightChanges({ status: 'boarded', departureTime: dep }, live({ status: 'landed' }), after).alerts).toEqual([{ kind: 'landed' }]);
  });
  it('a delay that clears goes back to on time', () => {
    const r = flightChanges({ status: 'upcoming', delayMinutes: 45 } as never, live({ status: 'scheduled', delayMinutes: null }), NOW);
    expect(r.patch.delayMinutes).toBe(0);
    expect(r.alerts).toEqual([]);
  });
});
