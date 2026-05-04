export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  startDate: string | null;   // ISO string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
  mustSee: string[];
  preferences: string;
}

export interface GeneratedActivity {
  type: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'free';
  title: string;
  address: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string;
  cost: number | null;
  currency: string | null;
}

export interface GeneratedDay {
  dayNumber: number;
  title: string;
  notes: string;
  activities: GeneratedActivity[];
}

export interface GeneratedTrip {
  title: string;
  description: string;
  days: GeneratedDay[];
}
