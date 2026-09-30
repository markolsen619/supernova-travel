import type { ActivityType } from '@/types';

/**
 * Where a "book this" button sends someone.
 *
 * The app never takes a booking itself. Doing so would mean merchant
 * agreements, payment handling, cancellations and being answerable for
 * someone's ruined holiday. It hands off instead — which Apple explicitly
 * permits, because travel is a real-world service rather than digital
 * content, so it is outside In-App Purchase.
 *
 * Two destinations, chosen by what the stop is:
 *
 *  - Hotels go to Booking.com with the trip's own dates prefilled. This is
 *    the affiliate relationship and the only one worth the integration —
 *    hotels are the highest-value line in an itinerary.
 *
 *  - Everything else bookable goes to its Google Maps entry, which already
 *    carries the place's own reserve / call / website actions. That is
 *    deliberate rather than lazy: fetching a website or phone number
 *    ourselves would move every place lookup into a pricier Places SKU, for
 *    a worse version of a page Maps renders for free.
 */

export interface BookingAction {
  /** Names the destination, so it is obvious this leaves the app. */
  label: string;
  url: string;
}

export interface BookingActionInput {
  type: ActivityType | null;
  /** Google place id. Empty for a Mapbox-grounded stop. */
  placeId: string;
  /** The business's own name — never a stop title like "Hotel Check-in". */
  name: string;
  /** The city it's in. Booking.com's search is free text, and a bare hotel
   *  name ("Hyatt Regency") matches that chain everywhere. */
  near?: string | null;
  /** Trip dates as calendar dates (YYYY-MM-DD), when known. */
  checkIn: string | null;
  checkOut: string | null;
  /** EXPO_PUBLIC_BOOKING_AFFILIATE_ID. Absent until the account exists. */
  affiliateId: string | null;
}

/** Types with nothing to book: free time, and a flight already ticketed. */
const NOT_BOOKABLE: ReadonlySet<string> = new Set(['free', 'flight', 'transport']);

function googleMapsUrl(placeId: string, name: string): string {
  const query = encodeURIComponent(name.trim());
  // query_place_id pins the exact place; without an id Maps still resolves a
  // name search, which is the best available for a Mapbox-grounded stop.
  return placeId
    ? `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Booking.com offers no public link to a property by anything we hold (its
 * hotel pages are keyed by its own slugs, reachable only through the partner
 * API), so the hand-off is a search. Name plus city puts the property first
 * in the results with the dates already applied.
 */
export function bookingSearchText(name: string, near: string | null): string {
  const trimmed = name.trim();
  const city = near?.trim();
  if (!city || trimmed.toLowerCase().includes(city.toLowerCase())) return trimmed;
  return `${trimmed}, ${city}`;
}

function bookingComUrl(input: BookingActionInput): string {
  const params = new URLSearchParams({ ss: bookingSearchText(input.name, input.near ?? null) });
  if (input.checkIn && input.checkOut) {
    params.set('checkin', input.checkIn);
    params.set('checkout', input.checkOut);
  }
  // No affiliate id yet is fine — the link still works, it just earns
  // nothing. Better than hiding the button until the account exists.
  if (input.affiliateId) params.set('aid', input.affiliateId);
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

export function buildBookingAction(input: BookingActionInput): BookingAction | null {
  if (!input.placeId && !input.name.trim()) return null;
  if (input.type && NOT_BOOKABLE.has(input.type)) return null;

  if (input.type === 'hotel') {
    return { label: 'Book on Booking.com', url: bookingComUrl(input) };
  }

  return {
    label: input.type === 'restaurant' ? 'Reserve or call' : 'Tickets and hours',
    url: googleMapsUrl(input.placeId, input.name),
  };
}
