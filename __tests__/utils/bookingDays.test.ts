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

describe('transit tickets on trip days', () => {
  const train = { kind: 'reservation', item: {
    id: 't', ownerUid: 'me', type: 'transit', title: 'ICE 918 Munich → Cologne', confirmationCode: '584772518091',
    checkIn: '2026-07-26', departureLocalTime: '09:19', fromPlace: 'München Hbf', toPlace: 'Köln Messe/Deutz',
    seat: '55, 56 (car 39)', createdAt: '',
  } } as unknown as TripBooking;
  it('lands on its date at the printed departure time', () => {
    expect(bookingsByDay(days, [train]).d2).toEqual([{ booking: train, role: 'booked', time: '09:19' }]);
  });
  it('reads as a route with seat and booking reference', () => {
    expect(bookingLines({ booking: train, role: 'booked', time: '09:19' }))
      .toEqual({ title: 'ICE 918 Munich → Cologne · 09:19', detail: 'Seat 55, 56 (car 39) · Conf. 584772518091' });
  });
});

describe('reservationKind', () => {
  const { reservationKind } = require('@/utils/bookingDays');
  it('a stored activity with a transitMode is a transit ticket', () => {
    expect(reservationKind({ type: 'activity', transitMode: 'train' })).toBe('transit');
    expect(reservationKind({ type: 'activity' })).toBe('activity');
    expect(reservationKind({ type: 'hotel' })).toBe('hotel');
    expect(reservationKind({ type: 'transit' })).toBe('transit');
  });
});

describe('a reservation’s own time', () => {
  it('a dinner booking carries its table time onto its day', () => {
    const days = [{ id: 'd1', date: new Date(2026, 10, 19) }];
    const dinner = { kind: 'reservation', item: { id: 'r', type: 'restaurant', title: 'Lokál', confirmationCode: 'L', checkIn: '2026-11-19', time: '19:30', ownerUid: 'u', createdAt: '' } } as never;
    expect(bookingsByDay(days, [dinner]).d1[0].time).toBe('19:30');
  });
});

describe('a timed reservation on its day', () => {
  it('shows its time in the row, like a train', () => {
    const dinner = { kind: 'reservation', item: { id: 'r', type: 'restaurant', title: 'Lokál', confirmationCode: 'L1', checkIn: '2026-11-19', time: '19:30', ownerUid: 'u', createdAt: '' } } as never;
    expect(bookingLines({ booking: dinner, role: 'booked', time: '19:30' }).title).toBe('Lokál · 19:30');
  });
});
