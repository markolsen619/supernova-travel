export type TravelStyle = 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';

export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  startDate: string | null;   // ISO date string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: TravelStyle;
  mustSee: string[];
  preferences: string;
}
