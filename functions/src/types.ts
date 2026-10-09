export interface GenerateTripRequest {
  /** A Firestore auto-id made by the app; the trip is written at trips/{requestId}
   * so a retry after a dropped connection can't duplicate it. Absent from older apps. */
  requestId?: string;
  destination: string;
  countryCode: string;
  /** The picked place (Places Autocomplete), so the trip keeps it rather than re-grounding the name. Absent from older apps. */
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Additional stops beyond the primary destination, in visit order. Stored
   * on the created trip; NOT yet used by buildPrompt() (Phase 2 — see
   * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md). */
  additionalDestinations: { name: string; placeId: string | null; lat: number | null; lng: number | null; countryCode: string | null }[];
  startDate: string | null;   // ISO string or null
  endDate: string | null;
  durationDays: number;
  /** First of travelStyles; the only style field an older client sends. */
  travelStyle: 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural' | 'party' | 'relax' | 'foodie' | 'romantic';
  /** Every style picked. Absent from clients older than 1.0.1 — see resolveTravelStyles(). */
  travelStyles?: GenerateTripRequest['travelStyle'][];
  pace: 'relaxed' | 'moderate' | 'packed';
  /** Absent from clients older than 1.0.1 — see resolveTripVisibility(). */
  visibility?: 'public' | 'followers' | 'private';
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
  /** 0-based index into the destination list. Absent on single-city trips and
   *  on every trip generated before this field existed — the client infers it
   *  from transport markers in that case (utils/dayDestination.ts). */
  destinationIndex?: number | null;
  title: string;
  notes: string;
  activities: GeneratedActivity[];
}

export interface GeneratedTrip {
  title: string;
  description: string;
  /** Multi-city prompt only: the area the whole trip covers ("Baja California Sur"). */
  region?: string;
  days: GeneratedDay[];
}

export interface ParseTravelConfirmationRequest {
  text?: string;           // pasted confirmation text
  imageBase64?: string;    // photo/screenshot, base64-encoded, no data: URI prefix
  imageMimeType?: string;  // required if imageBase64 present, e.g. "image/jpeg"
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
        originCountryCode: string;
        destinationCountryCode: string;
        departureLocalDate: string;
        departureTime: string; // ISO 8601, best-effort
        arrivalTime: string;
        seat: string;
        boardingGroup: string;
        gate: string;
        terminal: string;
      }>;
    }
  | {
      kind: 'reservation';
      reservationType: 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show' | 'transit';
      fields: Partial<{
        title: string;
        confirmationCode: string;
        checkIn: string;  // ISO 8601 date, best-effort
        checkOut: string;
        address: string;
        city: string;
        countryCode: string;
        // transit (train / bus / ferry)
        transitMode: string;
        operator: string;
        fromPlace: string;
        toPlace: string;
        departureLocalTime: string; // HH:MM as printed
        arrivalLocalTime: string;
        seat: string;
        originCity: string;
        originCountryCode: string;
        notes: string;
      }>;
    };
