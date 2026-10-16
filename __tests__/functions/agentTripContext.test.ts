// __tests__/functions/agentTripContext.test.ts
import { buildTripContext, bookingForContext, CONTEXT_BUDGET_CHARS, type TripCtxInput } from '../../functions/src/agentTripContext';

const trip = (over: Partial<TripCtxInput> = {}): TripCtxInput => ({
  title: 'Lisbon & Porto', startDay: '2026-11-02', today: '2026-10-14',
  cities: [{ name: 'Lisbon', nights: 3 }, { name: 'Porto', nights: 2 }],
  days: [
    { id: 'D1', dayNumber: 1, city: 0, stops: [
      { id: 'A', title: 'Check in at Memmo Alfama', type: 'hotel', startTime: null, placed: true, order: 1 },
      { id: 'B', title: 'Lunch at Time Out Market', type: 'restaurant', startTime: '13:00', placed: false, order: 2 },
    ] },
    { id: 'D2', dayNumber: 2, city: 0, stops: [{ id: 'C', title: 'Belém Tower', type: 'activity', startTime: null, placed: true, order: 1 }] },
  ],
  bookings: [{ kind: 'flight', name: 'TAP TP202 JFK→LIS', date: '2026-11-02', time: '07:45', shared: false }],
  topPlaces: [{ city: 0, name: 'Pastéis de Belém', type: 'restaurant' }],
  ...over,
});

describe('buildTripContext', () => {
  it('labels days and stops and maps them back to ids', () => {
    const { text, labels } = buildTripContext(trip());
    expect(text).toContain('d1 2026-11-02 Lisbon');
    expect(text).toContain('s1 Check in at Memmo Alfama [hotel]');
    expect(text).toContain('s2 Lunch at Time Out Market [restaurant 13:00, unplaced]');
    expect(labels.days.d2).toBe('D2');
    expect(labels.stops.s3).toEqual({ dayId: 'D2', stopId: 'C' });
    expect(labels.dayStops.D1).toEqual(['A', 'B']);
    expect(labels.cityCount).toBe(2);
  });
  it('lists cities with nights, bookings and community favourites', () => {
    const { text } = buildTripContext(trip());
    expect(text).toContain('c1 Lisbon 3n | c2 Porto 2n');
    expect(text).toContain('flight TAP TP202 JFK→LIS 2026-11-02 07:45');
    expect(text).toContain('c1: Pastéis de Belém (restaurant)');
  });
  it('works without dates', () => {
    const { text } = buildTripContext(trip({ startDay: null }));
    expect(text).toContain('d1 Lisbon');
    expect(text).toContain('dates not set');
  });
  it('keeps a long trip inside the budget', () => {
    const days = Array.from({ length: 21 }, (_, i) => ({
      id: `D${i + 1}`, dayNumber: i + 1, city: 0,
      stops: Array.from({ length: 6 }, (_, j) => ({ id: `S${i}_${j}`, title: `A rather long stop title number ${j} on day ${i + 1} somewhere nice`, type: 'activity', startTime: null, placed: true, order: j })),
    }));
    const { text, labels } = buildTripContext(trip({ days }));
    expect(text.length).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS);
    expect(labels.stops.s126).toEqual({ dayId: 'D21', stopId: 'S20_5' });
    expect(text).toContain('d21');
  });
});

describe('bookingForContext', () => {
  it('keeps type, name, date and time — never codes, addresses or barcodes', () => {
    const b = bookingForContext('reservation', {
      type: 'hotel', title: 'Memmo Alfama', checkIn: '2026-11-02', confirmationCode: 'XYZ123', address: 'Travessa 1', time: null,
    }, false);
    expect(b).toEqual({ kind: 'hotel', name: 'Memmo Alfama', date: '2026-11-02', time: null, shared: false });
    expect(JSON.stringify(b)).not.toContain('XYZ123');
    const f = bookingForContext('boarding_pass', {
      airline: 'TAP', flightNumber: 'TP202', origin: 'JFK', destination: 'LIS', departureTime: '2026-11-02T07:45:00', localDate: '2026-11-02', barcode: 'M1SECRET',
    }, true);
    expect(f).toEqual({ kind: 'flight', name: 'TAP TP202 JFK→LIS', date: '2026-11-02', time: '07:45', shared: true });
    expect(JSON.stringify(f)).not.toContain('SECRET');
  });
  it('reads train tickets stored as activities with a transit mode, and rental cars', () => {
    expect(bookingForContext('reservation', { type: 'activity', transitMode: 'train', title: 'Lisbon → Porto', checkIn: '2026-11-05', time: '09:19' }, false)?.kind).toBe('transit');
    expect(bookingForContext('reservation', { type: 'rental_car', title: 'Hertz', checkIn: '2026-11-05' }, false)?.kind).toBe('car');
  });
  it('ignores bookings without a name', () => {
    expect(bookingForContext('reservation', { type: 'hotel' }, false)).toBeNull();
  });
});
