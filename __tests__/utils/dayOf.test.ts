import { checkInUrl, flightToday, liveActivityContent, shouldStartActivity, leaveByLine, activityPlan, androidFlightNotice } from '@/utils/dayOf';
import type { BoardingPass } from '@/types';

const pass = (o: Partial<BoardingPass> = {}): BoardingPass => ({
  id: 'p1', ownerUid: 'u', airline: 'TAP Air Portugal', flightNumber: 'TP204', origin: 'LIS', originCity: 'Lisbon',
  destination: 'OPO', destinationCity: 'Porto', departureTime: '2026-11-10T14:30:00Z', status: 'upcoming', createdAt: '2026-11-01T00:00:00Z', ...o,
} as BoardingPass);
const at = (iso: string) => new Date(iso);

describe('checkInUrl', () => {
  it('the airline\'s own page by flight-number code or name, else a web search', () => {
    expect(checkInUrl('TAP Air Portugal', 'TP204')).toContain('flytap.com');
    expect(checkInUrl('Delta Air Lines', '')).toContain('delta.com');
    const u = new URL(checkInUrl('Tiny Air', 'ZZ1'));
    expect(u.host).toBe('www.google.com');
    expect(u.searchParams.get('q')).toBe('Tiny Air online check-in');
  });
});

describe('flightToday', () => {
  it('the next flight departing today on its airport\'s clock', () => {
    const a = pass({ id: 'a', departureTime: '2026-11-10T09:00:00Z' });
    const b = pass({ id: 'b', departureTime: '2026-11-10T18:00:00Z' });
    expect(flightToday([b, a], at('2026-11-10T08:00:00Z'))?.id).toBe('a');
    expect(flightToday([b, a], at('2026-11-10T10:00:00Z'))?.id).toBe('b'); // a left more than 30 min ago
  });
  it('not yesterday\'s, tomorrow\'s or a cancelled one', () => {
    expect(flightToday([pass({ departureTime: '2026-11-11T09:00:00Z' })], at('2026-11-10T08:00:00Z'))).toBeNull();
    expect(flightToday([pass({ status: 'cancelled', departureTime: '2026-11-10T18:00:00Z' })], at('2026-11-10T08:00:00Z'))).toBeNull();
  });
});

describe('liveActivityContent', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  it('flight, route and what is known', () => {
    const c = liveActivityContent(pass({ gate: '14', seat: '21A' }), now);
    expect(c.title).toBe('TP204 · LIS → OPO');
    expect(c.subtitle).toBe('Gate 14 · Seat 21A');
    expect(c.endsAtMs).toBe(Date.parse('2026-11-10T14:30:00Z'));
    expect(c.ended).toBe(false);
  });
  it('delays and endings', () => {
    expect(liveActivityContent(pass({ delayMinutes: 25 } as Partial<BoardingPass>), now).subtitle).toBe('Delayed 25 min');
    expect(liveActivityContent(pass({ status: 'cancelled' }), now).ended).toBe(true);
    expect(liveActivityContent(pass({ arrivalTime: '2026-11-10T11:00:00Z' }), now).ended).toBe(true);
    expect(liveActivityContent(pass({ departureTime: '2026-11-10T08:00:00Z' }), now).ended).toBe(true); // 3 h after departure, no arrival
  });
});

describe('shouldStartActivity', () => {
  const now = Date.parse('2026-11-10T09:00:00Z');
  it('Pro, within 6 h, not yet started, not ended', () => {
    const p = pass();
    expect(shouldStartActivity(p, now, new Set(), true)).toBe(true);
    expect(shouldStartActivity(p, now, new Set(), false)).toBe(false);
    expect(shouldStartActivity(p, now, new Set(['p1']), true)).toBe(false);
    expect(shouldStartActivity(p, now - 2 * 3_600_000, new Set(), true)).toBe(false);
  });
});

describe('leaveByLine', () => {
  it('"Leave by 2:10 PM" on the airport clock, else nothing', () => {
    const key = '2026-11-10T14:30:00Z|LIS';
    expect(leaveByLine(pass({ dayOf: { key, leaveByMs: Date.parse('2026-11-10T11:10:00Z'), driveMin: 35 } } as Partial<BoardingPass>))).toBe('Leave by 11:10 AM');
    // No drive known: it's the time to be at the airport, as the push says.
    expect(leaveByLine(pass({ dayOf: { key, leaveByMs: Date.parse('2026-11-10T11:10:00Z'), driveMin: null } } as Partial<BoardingPass>))).toBe('Be at LIS by 11:10 AM');
    // Worked out for an earlier departure time: stale.
    expect(leaveByLine(pass({ dayOf: { key: '2026-11-09T14:30:00Z|LIS', leaveByMs: 1, driveMin: 35 } } as Partial<BoardingPass>))).toBeNull();
    expect(leaveByLine(pass())).toBeNull();
  });
});

describe('review fixes', () => {
  it('flightToday keeps a delayed flight until 30 min after its new time', () => {
    const p = pass({ delayMinutes: 90 } as Partial<BoardingPass>);
    expect(flightToday([p], at('2026-11-10T15:10:00Z'))?.id).toBe('p1');
    expect(flightToday([p], at('2026-11-10T16:31:00Z'))).toBeNull();
  });

  it('activityPlan: start today\'s flight within 6 h, once', () => {
    const p = pass();
    expect(activityPlan({}, [p], Date.parse('2026-11-10T10:00:00Z'))).toEqual({ stop: [], update: null, start: p });
    expect(activityPlan({ p1: 'a1' }, [p], Date.parse('2026-11-10T10:00:00Z'))).toEqual({ stop: [], update: { activityId: 'a1', pass: p }, start: null });
  });
  it('activityPlan: a started flight keeps updating past its departure until it lands', () => {
    const p = pass({ arrivalTime: '2026-11-10T15:30:00Z' } as Partial<BoardingPass>);
    const plan = activityPlan({ p1: 'a1' }, [p], Date.parse('2026-11-10T15:10:00Z'));
    expect(plan.stop).toEqual([]);
    expect(plan.update?.activityId).toBe('a1');
  });
  it('activityPlan: ends an activity whose flight landed, was cancelled or was deleted', () => {
    const now = Date.parse('2026-11-10T16:00:00Z');
    const landed = pass({ arrivalTime: '2026-11-10T15:30:00Z' } as Partial<BoardingPass>);
    expect(activityPlan({ p1: 'a1' }, [landed], now).stop).toEqual([{ passId: 'p1', activityId: 'a1' }]);
    expect(activityPlan({ p1: 'a1' }, [pass({ status: 'cancelled' })], Date.parse('2026-11-10T12:00:00Z')).stop).toEqual([{ passId: 'p1', activityId: 'a1' }]);
    expect(activityPlan({ gone: 'a9' }, [], now).stop).toEqual([{ passId: 'gone', activityId: 'a9' }]);
  });

  it('androidFlightNotice: text while within 6 h and not landed, else nothing', () => {
    const p = pass();
    expect(androidFlightNotice(p, Date.parse('2026-11-10T07:00:00Z'))).toBeNull();
    expect(androidFlightNotice(p, Date.parse('2026-11-10T10:00:00Z'))).toEqual({ title: 'Flight today · TP204 · LIS → OPO', body: 'To Porto' });
    expect(androidFlightNotice(p, Date.parse('2026-11-10T18:00:00Z'))).toBeNull();
  });
});

import { liveActivityReady, serialQueue, sameNotice } from '@/utils/dayOf';
describe('Live Activity hook rules (final review I3, I4, I6)', () => {
  it('waits for the passes and the tier: a cold start must not end a running activity', () => {
    expect(liveActivityReady({ passesLoading: true, serverTier: 'pro' })).toBe(false);
    expect(liveActivityReady({ passesLoading: false, serverTier: null })).toBe(false);
    expect(liveActivityReady({ passesLoading: false, serverTier: 'free' })).toBe(true);
  });
  it('serialQueue runs one sync at a time, in order (two at once started two activities)', async () => {
    const run = serialQueue();
    const log: string[] = [];
    const job = (name: string, ms: number) => () => new Promise<void>((r) => { log.push(`${name}+`); setTimeout(() => { log.push(`${name}-`); r(); }, ms); });
    await Promise.all([run(job('a', 20)), run(job('b', 1))]);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-']);
  });
  it('serialQueue keeps going after a failed job', async () => {
    const run = serialQueue();
    const log: string[] = [];
    await Promise.all([run(async () => { throw new Error('x'); }), run(async () => { log.push('next'); })]);
    expect(log).toEqual(['next']);
  });
  it('sameNotice: Android re-posts only when the text changed (every re-post buzzed)', () => {
    expect(sameNotice({ title: 'a', body: 'b' }, { title: 'a', body: 'b' })).toBe(true);
    expect(sameNotice({ title: 'a', body: 'b' }, { title: 'a', body: 'Gate 4' })).toBe(false);
    expect(sameNotice(null, { title: 'a', body: 'b' })).toBe(false);
  });
});

import { foregroundPresentation } from '@/utils/dayOf';
it('the ongoing flight notice sits quietly in the list while the app is open; every other push shows as before', () => {
  expect(foregroundPresentation('flight-today')).toEqual({ shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: true });
  expect(foregroundPresentation('abc')).toEqual({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true });
});

import { checkInVisible, flightCountdown, flightStatusLine } from '@/utils/dayOf';
describe('day-of polish (owner, 2026-11-08)', () => {
  const dep = Date.parse('2026-11-10T14:30:00Z');
  it('checkInVisible: only from 48 h before departure, until it leaves', () => {
    expect(checkInVisible(pass(), dep - 49 * 3_600_000)).toBe(false);
    expect(checkInVisible(pass(), dep - 47 * 3_600_000)).toBe(true);
    expect(checkInVisible(pass(), dep + 60_000)).toBe(false);
    expect(checkInVisible(pass({ status: 'cancelled' }), dep - 3_600_000)).toBe(false);
  });
  it('flightCountdown: departs in, with the delay; nothing once gone', () => {
    expect(flightCountdown(pass(), dep - (3 * 60 + 5) * 60_000)).toBe('Departs in 3 h 5 min');
    expect(flightCountdown(pass(), dep - 40 * 60_000)).toBe('Departs in 40 min');
    expect(flightCountdown(pass({ delayMinutes: 30 } as Partial<BoardingPass>), dep - 10 * 60_000)).toBe('Departs in 40 min');
    expect(flightCountdown(pass(), dep + 60_000)).toBeNull();
  });
  it('flightStatusLine: a delay or a live gate, else nothing', () => {
    expect(flightStatusLine(pass({ delayMinutes: 25 } as Partial<BoardingPass>))).toBe('Delayed 25 min');
    expect(flightStatusLine(pass({ delayMinutes: 25, gate: 'B12', gateSource: 'live' } as Partial<BoardingPass>))).toBe('Delayed 25 min · Gate B12');
    expect(flightStatusLine(pass({ gate: 'B12', gateSource: 'live' } as Partial<BoardingPass>))).toBe('Gate B12');
    expect(flightStatusLine(pass({ gate: 'B12' }))).toBeNull();
    expect(flightStatusLine(pass({ delayMinutes: 10 } as Partial<BoardingPass>))).toBeNull();
  });
});
