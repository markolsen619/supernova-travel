import { countdownLabel, todayInfo, todaysBooking } from '@/utils/todayCard';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T12:00:00`) });
const act = (id: string, order: number, visited = false) => ({ id, title: `Stop ${id}`, order, visited });
const cities = { destination: { name: 'Prague' }, additionalDestinations: [{ name: 'Budapest' }, { name: 'Vienna' }] };

// The owner's Europe trip shape: many days, cities by destinationIndex, most days empty, no times.
const europe = {
  ...cities, startDay: '2026-11-18', startDate: ts('2026-11-18'), endDate: ts('2026-11-25'),
  days: [
    { id: 'd1', dayNumber: 1, destinationIndex: 0, activities: [act('a', 0)] },
    { id: 'd2', dayNumber: 2, destinationIndex: 0, activities: [] },
    { id: 'd4', dayNumber: 4, destinationIndex: 1, activities: [act('b', 1000, true), act('c', 2000), act('d', 3000)] },
    { id: 'd8', dayNumber: 8, destinationIndex: 2, activities: [] },
  ],
};

describe('todayInfo', () => {
  it('a day with stops: number, city, stops in order, next = first not visited', () => {
    expect(todayInfo(europe, '2026-11-21')).toEqual({
      dayNumber: 4, totalDays: 8, dayId: 'd4', city: 'Budapest', nothingPlanned: false,
      stops: [
        { id: 'b', title: 'Stop b', visited: true, next: false },
        { id: 'c', title: 'Stop c', visited: false, next: true },
        { id: 'd', title: 'Stop d', visited: false, next: false },
      ],
    });
  });
  it('an empty day: nothing planned, still its city', () => {
    const t = todayInfo(europe, '2026-11-19')!;
    expect([t.dayNumber, t.city, t.nothingPlanned, t.stops]).toEqual([2, 'Prague', true, []]);
  });
  it('a date with no day document (deleted day): nothing planned, the trip city', () => {
    const t = todayInfo(europe, '2026-11-20')!;
    expect([t.dayNumber, t.dayId, t.city, t.nothingPlanned]).toEqual([3, null, 'Prague', true]);
  });
  it('more than 4 stops: a window of 4 around the next one', () => {
    const many = { ...europe, days: [{ id: 'x', dayNumber: 1, destinationIndex: 0, activities: [0, 1, 2, 3, 4, 5, 6].map((i) => act(`s${i}`, i, i < 5)) }] };
    expect(todayInfo(many, '2026-11-18')!.stops.map((s) => s.id)).toEqual(['s3', 's4', 's5', 's6']);
  });
  it('all visited: no stop is next', () => {
    const done = { ...europe, days: [{ id: 'x', dayNumber: 1, destinationIndex: 0, activities: [act('a', 0, true)] }] };
    expect(todayInfo(done, '2026-11-18')!.stops[0].next).toBe(false);
  });
  it('outside the trip, or undated: null', () => {
    expect(todayInfo(europe, '2026-11-26')).toBeNull();
    expect(todayInfo({ ...europe, startDay: null, startDate: null }, '2026-11-20')).toBeNull();
  });
});

it('countdownLabel', () => {
  expect(countdownLabel('2026-10-30', '2026-10-29')).toBe('TOMORROW');
  expect(countdownLabel('2026-11-18', '2026-10-29')).toBe('IN 20 DAYS');
});

describe('todaysBooking', () => {
  const flight = { kind: 'boarding_pass', item: { id: 'f', flightNumber: 'TP204', origin: 'LIS', destination: 'OPO', departureTime: '2026-10-29T13:20:00Z', localDate: '2026-10-29' } };
  const hotel = { kind: 'reservation', item: { id: 'h', type: 'hotel', title: 'Hotel Lisboa', checkIn: '2026-10-27', checkOut: '2026-10-31' } };
  it('a flight today wins over a hotel stay', () => {
    expect(todaysBooking([hotel, flight] as never, '2026-10-29')?.booking.item.id).toBe('f');
  });
  it('else the stay, else null', () => {
    expect(todaysBooking([hotel] as never, '2026-10-29')?.role).toBe('staying');
    expect(todaysBooking([] as never, '2026-10-29')).toBeNull();
  });
});
