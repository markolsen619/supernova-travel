import { cityBookings } from '@/utils/cityBookings';
import { cityRanges } from '@/utils/tripRoute';
import type { TripBooking } from '@/utils/bookingDays';

const ranges = cityRanges([3, 4, 3], '2026-11-25');
const names = ['Prague', 'Munich', 'Cologne'];
const hotel = { kind: 'reservation', item: { id: 'h', type: 'hotel', title: 'Boutique Hotel Falkenturm', placeCity: 'München', checkIn: '2026-11-28' } } as unknown as TripBooking;
const train = { kind: 'reservation', item: { id: 't', type: 'activity', transitMode: 'train', title: 'ICE 918', toPlace: 'Köln Hbf', placeCity: 'Cologne', checkIn: '2026-12-02' } } as unknown as TripBooking;
const flight = { kind: 'boarding_pass', item: { id: 'f', flightNumber: 'LH 431', destinationCity: 'Prague', localDate: '2026-11-25' } } as unknown as TripBooking;
const dinner = { kind: 'reservation', item: { id: 'd', type: 'restaurant', title: 'Lokál', placeCity: 'Prague', checkIn: '2026-11-26' } } as unknown as TripBooking;

describe('cityBookings', () => {
  it('puts flights and trains under the city they arrive in, and hotels under the city they’re in', () => {
    const by = cityBookings([hotel, train, flight, dinner], names, ranges);
    expect(by[0].arriving.map((b) => b.item.id)).toEqual(['f']);
    expect(by[1].staying.map((b) => b.item.id)).toEqual(['h']);
    expect(by[2].arriving.map((b) => b.item.id)).toEqual(['t']);
  });
  it('leaves restaurants and activities to the days', () => {
    const by = cityBookings([dinner], names, ranges);
    expect(by.every((c) => c.arriving.length === 0 && c.staying.length === 0)).toBe(true);
  });
});
