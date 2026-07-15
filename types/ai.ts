export type TravelStyle = 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
export type TripPace = 'relaxed' | 'moderate' | 'packed';

export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
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
