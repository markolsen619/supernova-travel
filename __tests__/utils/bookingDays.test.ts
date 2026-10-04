import { bookingsByDay, bookingMatchesStop, bookingLines, type TripBooking } from '@/utils/bookingDays';
import type { BoardingPass, Reservation } from '@/types';

const d = (iso: string) => new Date(`${iso}T00:00:00`);
const days = [
  { id: 'd1', date: d('2026-07-25') }, { id: 'd2', date: d('2026-07-26') },
  { id: 'd3', date: d('2026-07-27') }, { id: 'd4', date: d('2026-07-28') },
];
const flight: TripBooking = { kind: 'boarding_pass', item: {
  id: 'f', ownerUid: 'me', airline: 'American', flightNumber: 'AA104', origin: 'JFK', originCity: 'New York',
  destination: 'FCO', destinationCity: 'Rome', departureTime: '2026-07-25T08:10:00', seat: '14A',
  status: 'upcoming', createdAt: '', localDate: '2026-07-25', confirmationCode: undefined,
} as unknown as BoardingPass };
const hotel: TripBooking = { kind: 'reservation', item: {
  id: 'h', ownerUid: 'me', type: 'hotel', title: 'Hotel Artemide', confirmationCode: '88213',
  checkIn: '2026-07-25', checkOut: '2026-07-28', createdAt: '',
} as Reservation };

describe('bookingsByDay', () => {
  it('a flight lands on its local day', () => {
    expect(bookingsByDay(days, [flight]).d1).toEqual([{ booking: flight, role: 'flight', time: '08:10' }]);
  });
  it('a hotel: check in, staying each night between, check out', () => {
    const m = bookingsByDay(days, [hotel]);
    expect(m.d1[0].role).toBe('check_in');
    expect(m.d2[0].role).toBe('staying');
    expect(m.d3[0].role).toBe('staying');
    expect(m.d4[0].role).toBe('check_out');
  });
  it('dates outside the trip, and undated days, get nothing', () => {
    const early = { ...hotel, item: { ...hotel.item, checkIn: '2026-07-01', checkOut: '2026-07-02' } } as TripBooking;
    expect(bookingsByDay(days, [early])).toEqual({});
    expect(bookingsByDay([{ id: 'x', date: null }], [hotel])).toEqual({});
  });
  it('a restaurant is booked on its date', () => {
    const dinner = { kind: 'reservation', item: { ...hotel.item, id: 'r', type: 'restaurant', title: 'Luzzi', checkIn: '2026-07-26', checkOut: undefined } } as TripBooking;
    expect(bookingsByDay(days, [dinner]).d2[0].role).toBe('booked');
  });
});

describe('bookingMatchesStop', () => {
  it('the same hotel matches the planned stop', () => {
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check into Hotel Artemide' })).toBe(true);
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check in', placeName: 'Hotel Artemide' })).toBe(true);
  });
  it('a different hotel in the same city does not', () => {
    expect(bookingMatchesStop(hotel, { type: 'hotel', title: 'Check into Hotel Quirinale' })).toBe(false);
  });
  it('different kinds never match', () => {
    expect(bookingMatchesStop(hotel, { type: 'restaurant', title: 'Artemide bistro' })).toBe(false);
  });
});

describe('bookingLines', () => {
  it('reads like the trip page', () => {
    expect(bookingLines({ booking: flight, role: 'flight', time: '08:10' }))
      .toEqual({ title: 'AA104 · JFK → FCO · 08:10', detail: 'Seat 14A' });
    expect(bookingLines({ booking: hotel, role: 'check_in', time: null }))
      .toEqual({ title: 'Check in · Hotel Artemide', detail: 'Conf. 88213' });
    expect(bookingLines({ booking: hotel, role: 'staying', time: null }).title).toBe('Staying at Hotel Artemide');
  });
});
