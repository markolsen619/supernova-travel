import { reservationKind, type TripBooking } from '@/utils/bookingDays';
import { bookingCityIndex, type CityRange } from '@/utils/tripRoute';

/**
 * A city's "Getting here" (flights by destination, trains/buses/ferries by
 * where they arrive) and "Staying" (hotels and Airbnbs) on the trip page.
 * Everything else (restaurants, activities) shows on its day, as before.
 */
export function cityBookings(bookings: TripBooking[], names: string[], ranges: CityRange[]) {
  const out = names.map(() => ({ arriving: [] as TripBooking[], staying: [] as TripBooking[] }));
  for (const b of bookings) {
    let slot: 'arriving' | 'staying' | null = null;
    let city: string | null | undefined;
    let date: string | null | undefined;
    if (b.kind === 'boarding_pass') {
      slot = 'arriving';
      city = b.item.destinationCity || b.item.placeCity;
      date = b.item.localDate ?? b.item.departureTime?.slice(0, 10);
    } else {
      const kind = reservationKind(b.item);
      if (kind === 'transit') { slot = 'arriving'; city = b.item.placeCity || b.item.toPlace; }
      else if (kind === 'hotel' || kind === 'airbnb') { slot = 'staying'; city = b.item.placeCity || b.item.address; }
      date = b.item.checkIn;
    }
    if (!slot) continue;
    const i = bookingCityIndex({ city, date }, names, ranges, { departureDay: slot !== 'arriving' });
    if (i !== null) out[i][slot].push(b);
  }
  return out;
}
