// __tests__/utils/agentCard.test.ts
import { opLine, agentSuggestions, quotaLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';

const stop = (id: string, title: string, type = 'activity', order = 1) =>
  ({ id, title, type, order, startTime: null, endTime: null, lat: 1, lng: 1, placeId: null, address: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null, mediaUrls: [] }) as any;
const trip = {
  id: 'T', title: 'Lisbon & Porto',
  destination: { name: 'Lisbon', nights: 3 }, additionalDestinations: [{ name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [stop('A', 'Belém Tower'), stop('B', 'Oceanário', 'activity', 2), stop('C', 'Feitoria', 'restaurant', 3), stop('E', 'Alfama walk', 'activity', 4)] },
    { id: 'D2', dayNumber: 2, destinationIndex: 0, activities: [stop('F', 'LX Factory')] },
  ],
} as unknown as TripWithDays;

describe('opLine', () => {
  it('writes each change as one short line', () => {
    expect(opLine({ kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null }, trip))
      .toEqual({ icon: 'add', type: 'restaurant', text: 'Day 2 · Dinner at Ramiro' });
    expect(opLine({ kind: 'trip.removeStop', dayId: 'D1', stopId: 'B' }, trip)?.text).toBe('Day 1 · Remove Oceanário');
    expect(opLine({ kind: 'trip.moveStop', dayId: 'D1', stopId: 'A', toDayId: 'D2', afterStopId: null }, trip)?.text).toBe('Move Belém Tower to day 2');
    expect(opLine({ kind: 'trip.updateStop', dayId: 'D1', stopId: 'C', time: '20:00' }, trip)?.text).toBe('Day 1 · Feitoria at 20:00');
    expect(opLine({ kind: 'trip.setNights', city: 0, nights: 4 }, trip)?.text).toBe('Lisbon 3 → 4 nights');
    expect(opLine({ kind: 'trip.addCity', name: 'Sintra', nights: 1, afterCity: 0 }, trip)?.text).toBe('Add Sintra, 1 night, after Lisbon');
    expect(opLine({ kind: 'trip.shiftDates', newStart: '2026-11-04' }, trip)?.text).toBe('Start the trip on Wed, Nov 4');
  });
  it('returns null for a change that no longer fits the trip', () => {
    expect(opLine({ kind: 'trip.removeStop', dayId: 'D1', stopId: 'ZZ' }, trip)).toBeNull();
    expect(opLine({ kind: 'trip.setNights', city: 5, nights: 2 }, trip)).toBeNull();
  });
});

describe('agentSuggestions', () => {
  it('builds three requests from the trip itself', () => {
    const s = agentSuggestions(trip);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe('Make day 1 less rushed');
    expect(s).toContain('Add a night in Porto');
  });
});

describe('quotaLine', () => {
  it('counts down for free, stays quiet for Pro until close', () => {
    expect(quotaLine({ used: 6, limit: 10, fairUse: false, resetsAt: '' })).toBe('4 of 10 left this month');
    expect(quotaLine({ used: 10, limit: 300, fairUse: true, resetsAt: '' })).toBeNull();
    expect(quotaLine({ used: 280, limit: 300, fairUse: true, resetsAt: '' })).toBe('20 left this month');
  });
});
