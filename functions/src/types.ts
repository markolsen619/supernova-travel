export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  startDate: string | null;   // ISO string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
  pace: 'relaxed' | 'moderate' | 'packed';
  mustSee: string[];
  preferences: string;
}

export interface GeneratedActivity {
  type: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'free';
  title: string;
  /** One human-readable line Gemini believes describes the place — NOT a
   * verified address. Real address/lat/lng are only known once the client
   * lazily resolves searchQuery through Places (see Part B). */
  address: string | null;
  /** One-line reason this stop fits the traveler's request — shown in the UI, not written to notes. */
  rationale: string;
  startTime: string | null;
  endTime: string | null;
  notes: string;
  cost: number | null;
  currency: string | null;
  /** Human-readable, geographically-qualified search string (e.g. "Louvre
   * Museum, Paris") for later lazy Places grounding. Gemini must NOT invent a
   * placeId — this is the only place-identifying field it may output. */
  searchQuery: string;
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
