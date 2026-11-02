import { checkInUrl, flightToday, liveActivityContent, shouldStartActivity, leaveByLine } from '@/utils/dayOf';
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
    expect(leaveByLine(pass({ dayOf: { leaveByMs: Date.parse('2026-11-10T11:10:00Z') } } as Partial<BoardingPass>))).toBe('Leave by 11:10 AM');
    expect(leaveByLine(pass())).toBeNull();
  });
});
