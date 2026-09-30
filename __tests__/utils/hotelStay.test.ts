import { hotelStayDates } from '@/utils/hotelStay';

const d = (m: number, day: number) => new Date(2026, m - 1, day);
const hotel = (id: string, placeId: string | null, placeName?: string) => ({ id, type: 'hotel' as const, placeId, placeName });
const other = (id: string) => ({ id, type: 'restaurant' as const, placeId: 'r' });

describe('hotelStayDates', () => {
  const days = [
    { dayNumber: 1, date: d(7, 25), activities: [hotel('in', 'H1'), other('a')] },
    { dayNumber: 2, date: d(7, 26), activities: [other('b')] },
    { dayNumber: 3, date: d(7, 27), activities: [hotel('out', 'H1')] },
  ];

  it('runs from the first to the last day the same hotel appears', () => {
    expect(hotelStayDates(days, days[0].activities[0], { start: d(7, 25), end: d(7, 30) }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 27) });
  });

  it('gives the same stay when the check-out stop is the one tapped', () => {
    expect(hotelStayDates(days, days[2].activities[0], { start: d(7, 25), end: d(7, 30) }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 27) });
  });

  it('runs to the end of the trip when there is no check-out stop', () => {
    const single = [days[0], days[1]];
    expect(hotelStayDates(single, single[0].activities[0], { start: d(7, 25), end: d(7, 30) }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 30) });
  });

  it('matches by name when there is no Google id', () => {
    const named = [
      { dayNumber: 1, date: d(7, 25), activities: [hotel('in', null, 'The Dana')] },
      { dayNumber: 4, date: d(7, 28), activities: [hotel('out', null, 'The Dana')] },
    ];
    expect(hotelStayDates(named, named[0].activities[0], { start: null, end: null }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 28) });
  });

  it('derives day dates from the trip start when days carry none', () => {
    const undated = days.map((day) => ({ ...day, date: null }));
    expect(hotelStayDates(undated, undated[0].activities[0], { start: d(7, 25), end: d(7, 30) }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 27) });
  });

  it('knows nothing without any dates', () => {
    const undated = days.map((day) => ({ ...day, date: null }));
    expect(hotelStayDates(undated, undated[0].activities[0], { start: null, end: null }))
      .toEqual({ checkIn: null, checkOut: null });
  });

  it('checks out the next morning on a one-night trip', () => {
    const oneDay = [days[0]];
    expect(hotelStayDates(oneDay, oneDay[0].activities[0], { start: d(7, 25), end: d(7, 25) }))
      .toEqual({ checkIn: d(7, 25), checkOut: d(7, 26) });
  });
});
