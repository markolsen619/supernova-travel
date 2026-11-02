import { dueActions, bufferMinutes, leaveByMs, stayFor, previousDay, type DayOfPass } from '../../functions/src/dayOf';

const H = 3_600_000, M = 60_000;
const NOW = Date.UTC(2026, 10, 10, 12, 0);
const pass = (o: Partial<DayOfPass> = {}): DayOfPass => ({
  id: 'p', ownerUid: 'u', status: 'upcoming', departureMs: NOW + 24 * H, origin: 'LIS', destination: 'OPO',
  airline: 'TAP', flightNumber: 'TP204', destinationCity: 'Porto', tripId: null, dayOf: {}, ...o,
});
const pro = new Set(['u']);
const free = new Set<string>();

describe('dueActions', () => {
  it('check-in about 24 h before, once, for everyone', () => {
    expect(dueActions([pass()], NOW, free)).toEqual([{ kind: 'checkin', passId: 'p' }]);
    expect(dueActions([pass({ departureMs: NOW + 24 * H + 9 * M })], NOW, free)).toHaveLength(1);
    expect(dueActions([pass({ departureMs: NOW + 24 * H + 11 * M })], NOW, free)).toHaveLength(0);
    expect(dueActions([pass({ departureMs: NOW + 23 * H + 49 * M })], NOW, free)).toHaveLength(0);
    expect(dueActions([pass({ dayOf: { checkInSentAtMs: 1 } })], NOW, free)).toHaveLength(0);
  });
  it('leave-by worked out about 6 h before, Pro only, once', () => {
    const p = pass({ departureMs: NOW + 6 * H });
    expect(dueActions([p], NOW, pro)).toEqual([{ kind: 'computeLeaveBy', passId: 'p' }]);
    expect(dueActions([p], NOW, free)).toHaveLength(0);
    expect(dueActions([pass({ departureMs: NOW + 6 * H, dayOf: { leaveByMs: NOW + 2 * H } })], NOW, pro)).toHaveLength(0);
  });
  it('the leave push from 30 min before leave-by until departure, once', () => {
    const p = (o: Partial<DayOfPass['dayOf']>) => pass({ departureMs: NOW + 3 * H, dayOf: { leaveByMs: NOW + 20 * M, ...o } });
    expect(dueActions([p({})], NOW, pro)).toEqual([{ kind: 'leave', passId: 'p' }]);
    expect(dueActions([p({ leaveByMs: NOW + 40 * M })], NOW, pro)).toHaveLength(0);
    expect(dueActions([p({ leaveSentAtMs: 1 })], NOW, pro)).toHaveLength(0);
    expect(dueActions([p({})], NOW, free)).toHaveLength(0);
  });
  it('nothing for cancelled, completed, boarded or departed flights', () => {
    for (const status of ['cancelled', 'completed', 'boarded']) expect(dueActions([pass({ status })], NOW, pro)).toHaveLength(0);
    expect(dueActions([pass({ departureMs: NOW - M, dayOf: { leaveByMs: NOW - H } })], NOW, pro)).toHaveLength(0);
  });
});

describe('bufferMinutes / leaveByMs', () => {
  it('2 h domestic, 3 h international or unknown', () => {
    expect(bufferMinutes('LIS', 'OPO')).toBe(120);
    expect(bufferMinutes('LIS', 'JFK')).toBe(180);
    expect(bufferMinutes('LIS', 'ZZZ')).toBe(180);
  });
  it('departure minus buffer minus drive', () => {
    expect(leaveByMs(NOW, 180, 35)).toBe(NOW - 215 * M);
    expect(leaveByMs(NOW, 120, null)).toBe(NOW - 120 * M);
  });
});

describe('stayFor', () => {
  const stops = [
    { dayKey: '2026-11-09', type: 'hotel', lat: 38.71, lng: -9.14 },
    { dayKey: '2026-11-10', type: 'activity', lat: 38.7, lng: -9.1 },
    { dayKey: '2026-11-10', type: 'hotel', lat: null, lng: null },
  ];
  it('the departure day\'s located hotel, else the night before, else none', () => {
    expect(stayFor([...stops, { dayKey: '2026-11-10', type: 'hotel', lat: 38.72, lng: -9.15 }], '2026-11-10')).toEqual({ lat: 38.72, lng: -9.15 });
    expect(stayFor(stops, '2026-11-10')).toEqual({ lat: 38.71, lng: -9.14 });
    expect(stayFor(stops, '2026-12-01')).toBeNull();
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });
});
