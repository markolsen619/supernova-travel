export type TravelStyle = 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
export type TripPace = 'relaxed' | 'moderate' | 'packed';

export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  /** Additional stops beyond the primary destination, in visit order — see
   * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md.
   * Stored on the created trip; NOT yet used by the Gemini prompt (Phase 2). */
  additionalDestinations: { name: string; placeId: string | null; lat: number | null; lng: number | null; countryCode: string | null }[];
  startDate: string | null;   // ISO date string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: TravelStyle;
  pace: TripPace;
  mustSee: string[];
  preferences: string;
}

export interface AiTripQuota {
  tier: 'free' | 'pro' | 'business';
  /** null = unlimited (pro/business) */
  limit: number | null;
  /** null = unlimited (pro/business) */
  remaining: number | null;
  /** ISO timestamp of the next reset, null = unlimited */
  resetsAt: string | null;
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
