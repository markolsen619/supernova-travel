// __tests__/utils/agentCard.test.ts
import { opLine, agentSuggestions, quotaLine, cardLines, requestIdFor } from '@/utils/agentCard';
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
    expect(opLine({ kind: 'trip.addStop', dayId: 'D2', title: 'Dinner at Ramiro', type: 'restaurant', afterStopId: null, time: null, query: null }, trip))
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

// Review 2026-10-15: after Apply, a removed stop is gone and a moved stop has a new id, so their lines
// came back null and an APPLIED card said its own changes "no longer fit the trip".
describe('cardLines', () => {
  const gone = { kind: 'trip.removeStop', dayId: 'D1', stopId: 'ZZ' } as const;
  const ok = { kind: 'trip.setNights', city: 0, nights: 4 } as const;
  it('marks a change that no longer fits while the proposal is open', () => {
    expect(cardLines([gone, ok], trip, false).map((l) => l.line?.text ?? 'STALE')).toEqual(['STALE', 'Lisbon 3 → 4 nights']);
  });
  it('leaves out changes that can no longer be described once applied', () => {
    expect(cardLines([gone, ok], trip, true).map((l) => l.line?.text)).toEqual(['Lisbon 3 → 4 nights']);
  });
  it('keeps the index of each change so unticking still maps to the right operation', () => {
    expect(cardLines([gone, ok], trip, true)[0].index).toBe(1);
  });
});

// Review 2026-10-15: a dropped connection after the server saved and charged showed an error, and the
// retry minted a new id — charged again. Retrying the same message reuses its id; the server returns
// the saved answer for free (or runs it, if nothing was saved).
describe('requestIdFor', () => {
  const mint = () => 'NEW';
  it('reuses the id of the failed attempt when the same message is sent again', () => {
    expect(requestIdFor('Add a rooftop bar', { text: 'Add a rooftop bar', requestId: 'OLD' }, mint)).toBe('OLD');
  });
  it('mints a new id for a different message, or when nothing failed', () => {
    expect(requestIdFor('Something else', { text: 'Add a rooftop bar', requestId: 'OLD' }, mint)).toBe('NEW');
    expect(requestIdFor('Add a rooftop bar', null, mint)).toBe('NEW');
  });
  it('ignores spaces around the message', () => {
    expect(requestIdFor('  Add a rooftop bar ', { text: 'Add a rooftop bar', requestId: 'OLD' }, mint)).toBe('OLD');
  });
});

describe('opLine with grounding (phase 2)', () => {
  const trip = { destination: { name: 'Mission Beach' }, additionalDestinations: [], days: [{ id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [] }] } as never;
  const op = { kind: 'trip.addStop', dayId: 'D1', title: 'Drinks at Pennant', type: 'restaurant', afterStopId: null, time: null, query: 'Pennant, Mission Beach' } as never;
  it('shows the found address', () => {
    const l = opLine(op, trip, { status: 'found', place: { name: 'Pennant', address: '2893 Mission Blvd', lat: 1, lng: 1 } } as never);
    expect(l?.detail).toBe('Pennant · 2893 Mission Blvd');
    expect(l?.unavailable).toBeFalsy();
  });
  it('greys out a place not found nearby', () => {
    const l = opLine(op, trip, { status: 'notFound' });
    expect(l?.unavailable).toBe(true);
    expect(l?.detail).toBe("Couldn't find this near Mission Beach");
  });
  it('says it is looking while pending', () => {
    expect(opLine(op, trip, 'pending')?.detail).toBe('Finding it on the map…');
  });
});

describe('opLine for trip.v2', () => {
  const trip = { destination: { name: 'Mission Beach' }, additionalDestinations: [], days: [{ id: 'D1', dayNumber: 1, destinationIndex: 0, activities: [{ id: 'B', title: 'Museum', type: 'activity' }] }, { id: 'D2', dayNumber: 2, destinationIndex: 0, activities: [] }] } as never;
  it('names visibility changes plainly', () => {
    expect(opLine({ kind: 'trip.updateTrip', visibility: 'public' }, trip)?.text).toBe('Make this trip Public');
    expect(opLine({ kind: 'trip.updateTrip', visibility: 'followers' }, trip)?.text).toBe('Make this trip Followers only');
  });
  it('optimizeDay, swapDays, rename, packing, edit', () => {
    expect(opLine({ kind: 'trip.optimizeDay', dayId: 'D1' }, trip)?.text).toBe('Day 1 · Shortest route');
    expect(opLine({ kind: 'trip.swapDays', dayId: 'D1', withDayId: 'D2' }, trip)?.text).toBe('Swap day 1 and day 2');
    expect(opLine({ kind: 'trip.updateTrip', title: 'MB weekend' }, trip)?.text).toBe('Rename to “MB weekend”');
    expect(opLine({ kind: 'trip.addPacking', label: 'Sunscreen', category: 'Essentials' }, trip)?.text).toBe('Pack sunscreen');
    expect(opLine({ kind: 'trip.editStop', dayId: 'D1', stopId: 'B', title: 'Drinks at Pennant' }, trip)?.text).toBe('Day 1 · Museum → Drinks at Pennant');
  });
});

describe('opLine for wallet.v1', () => {
  const trip = { destination: { name: 'MB' }, additionalDestinations: [], days: [] } as never;
  const add = { kind: 'wallet.addReservation', type: 'restaurant', title: 'Pennant', date: '2026-11-01', time: '19:00', endDate: null, confirmationCode: 'ABC123' } as never;
  it('adding a reservation says when, and that linking is Pro for free accounts', () => {
    expect(opLine(add, trip, undefined, { paid: true })?.text).toBe('Add Pennant to your wallet · Sun, Nov 1 at 19:00');
    expect(opLine(add, trip, undefined, { paid: false })?.detail).toBe('Saved to your wallet. Putting it on the trip is part of Pro.');
  });
  it('link / unlink / update name the booking', () => {
    const names = { R1: 'Catamaran Resort' };
    expect(opLine({ kind: 'wallet.linkBooking', bookingKind: 'reservation', bookingId: 'R1' } as never, trip, undefined, { bookingNames: names })?.text).toBe('Put Catamaran Resort on this trip');
    expect(opLine({ kind: 'wallet.unlinkBooking', bookingKind: 'reservation', bookingId: 'R1' } as never, trip, undefined, { bookingNames: names })?.text).toBe('Take Catamaran Resort off this trip');
    expect(opLine({ kind: 'wallet.updateBooking', bookingKind: 'reservation', bookingId: 'R9', time: '20:00' } as never, trip)?.text).toBe('A booking: 20:00');
  });
});
