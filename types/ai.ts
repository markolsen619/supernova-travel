import type { TripVisibility } from '@/types';

export type TravelStyle = 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
export type TripPace = 'relaxed' | 'moderate' | 'packed';

export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  /** The picked place (Places Autocomplete), so the trip keeps it rather than re-grounding the name. Absent from older apps. */
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Additional stops beyond the primary destination, in visit order — see
   * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md.
   * Stored on the created trip; NOT yet used by the Gemini prompt (Phase 2). */
  additionalDestinations: { name: string; placeId: string | null; lat: number | null; lng: number | null; countryCode: string | null }[];
  startDate: string | null;   // ISO date string or null
  endDate: string | null;
  durationDays: number;
  /** The first of travelStyles — kept for a server that predates multiple styles. */
  travelStyle: TravelStyle;
  /** Every style the traveler picked, at least one. */
  travelStyles: TravelStyle[];
  pace: TripPace;
  /** Who can see the generated trip. A server older than 1.0.1 ignores it and saves private. */
  visibility: TripVisibility;
  mustSee: string[];
  preferences: string;
}

/**
 * Mirrors AiTripQuotaResponse in functions/src/getAiTripQuota.ts.
 *
 * No nullable "unlimited" fields any more: every tier is metered, because
 * Gemini bills per call and an uncapped paid tier is an uncapped bill. Paid
 * buys a shorter window, not an unmetered one.
 */
export interface AiTripQuota {
  tier: 'free' | 'pro' | 'business';
  limit: number;
  remaining: number;
  /** ISO timestamp of the next reset. */
  resetsAt: string;
  /** Both tiers are monthly. */
  window: 'week' | 'month';
  /** True for paid: `limit` is an anti-abuse ceiling, so show "unlimited". */
  fairUse: boolean;
}

export interface ImportQuota {
  tier: 'free' | 'pro' | 'business';
  limit: number | null;      // null = unlimited
  remaining: number | null;  // null = unlimited
  resetsAt: string | null;   // null = unlimited
}

export interface ParseTravelConfirmationRequest {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export type ParseTravelConfirmationResult =
  | {
      kind: 'boarding_pass';
      fields: Partial<{
        airline: string;
        flightNumber: string;
        origin: string;
        originCity: string;
        destination: string;
        destinationCity: string;
        departureTime: string;
        arrivalTime: string;
        seat: string;
        boardingGroup: string;
        gate: string;
        terminal: string;
      }>;
    }
  | {
      kind: 'reservation';
      reservationType: 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show';
      fields: Partial<{
        title: string;
        confirmationCode: string;
        checkIn: string;
        checkOut: string;
        address: string;
        notes: string;
      }>;
    };
