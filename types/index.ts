import { Timestamp } from 'firebase/firestore';

export type Tier = 'free' | 'pro' | 'business';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface UserProfile {
  uid: string;
  /** The person's real name (e.g. "Mark Olsen") — distinct from `username`,
   * their unique @handle. Firestore field is `fullName`; older docs may only
   * have the legacy `displayName` field, so every read site that builds a
   * UserProfile applies a `fullName ?? displayName` fallback at the source
   * (see app/_layout.tsx, hooks/useUserProfile.ts, hooks/useExplore.ts,
   * hooks/useSearch.ts) — this type itself only ever carries the clean
   * `fullName`, so nothing downstream needs to know the legacy name exists. */
  fullName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
  followersCount: number;
  followingCount: number;
  tripsCount: number;
  tier: Tier;
  createdAt: string;
}

export type PostMediaType = 'photo' | 'video' | 'trip';

export interface Post {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  caption: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  mediaUrls: string[];
  thumbnailUrl: string | null;
  placeName: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  tripId: string | null;
  tripTitle: string | null;
  tripDestination: string | null;
  tripDateRange: string | null;
  likesCount: number;
  commentsCount: number;
  tags: string[];
  createdAt: Timestamp;
}

export interface Comment {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  text: string;
  createdAt: Timestamp;
}

export type TripStatus = 'planning' | 'active' | 'completed';
export type TripVisibility = 'public' | 'followers' | 'private';

export interface Trip {
  id: string;
  authorUid: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  destination: {
    name: string;
    placeId: string | null;
    lat: number | null;
    lng: number | null;
    countryCode: string | null;
  };
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  visibility: TripVisibility;
  collaborators: string[];
  isAiGenerated: boolean;
  status: TripStatus;
  tags: string[];
  likesCount: number;
  savesCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Follow {
  followerUid: string;
  followeeUid: string;
  createdAt: Timestamp;
}

export type ActivityType = 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'free';

export interface TripActivity {
  id: string;
  type: ActivityType;
  title: string;
  placeId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;    // "14:30" wall-clock, NOT a Timestamp
  endTime: string | null;
  durationMinutes: number | null;
  notes: string;
  bookingRef: string | null;
  cost: number | null;
  currency: string | null;
  mediaUrls: string[];
  order: number;
  createdAt: Timestamp;
  /**
   * Human-readable, geographically-qualified search string (e.g. "Louvre
   * Museum, Paris") set by AI generation for stops not yet grounded to a real
   * Google place. Non-null exactly when placeId is still null — the stop is
   * "ungrounded" until the client lazily resolves it on first interaction
   * (tap in the trip view, add-to-trip, show-on-map). Always null for
   * manually-created or already-grounded activities.
   */
  searchQuery: string | null;
}

export interface TripDay {
  id: string;
  dayNumber: number;
  date: Timestamp | null;
  title: string;
  notes: string;
  activities: TripActivity[];  // loaded client-side from subcollection
}

export interface TripWithDays extends Trip {
  days: TripDay[];
}

export interface CreateTripInput {
  title: string;
  description: string;
  destination: Trip['destination'];
  startDate: Date | null;
  endDate: Date | null;
  visibility: TripVisibility;
  tags: string[];
  coverImageUrl: string | null;
  isAiGenerated: boolean;
}

export interface UpdateTripInput {
  title?: string;
  description?: string;
  coverImageUrl?: string | null;
  visibility?: TripVisibility;
  tags?: string[];
  startDate?: Date | null;
  endDate?: Date | null;
  status?: TripStatus;
}

// ── Wallet ──────────────────────────────────────────────────────────────────

export type BoardingPassStatus = 'upcoming' | 'checked_in' | 'boarded' | 'completed' | 'cancelled';
export type BarcodeFormat = 'aztec' | 'qr' | 'pdf417' | 'code128';

export interface BoardingPass {
  id: string;
  ownerUid: string;
  airline: string;
  flightNumber: string;
  origin: string;           // IATA airport code, e.g. "JFK"
  originCity: string;
  destination: string;      // IATA airport code, e.g. "LHR"
  destinationCity: string;
  departureTime: string;    // ISO 8601
  arrivalTime?: string;     // ISO 8601
  seat?: string;
  boardingGroup?: string;
  gate?: string;
  barcode?: string;         // raw barcode string
  barcodeFormat?: BarcodeFormat;
  status: BoardingPassStatus;
  createdAt: string;        // ISO 8601
}

export type ReservationType = 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity';

export interface Reservation {
  id: string;
  ownerUid: string;
  type: ReservationType;
  title: string;            // e.g. "The Ritz-Carlton, Tokyo"
  confirmationCode: string;
  checkIn?: string;         // ISO 8601 date
  checkOut?: string;        // ISO 8601 date
  address?: string;
  notes?: string;
  attachmentUrls?: string[];
  createdAt: string;
}

export type LoyaltyUnit = 'miles' | 'points' | 'nights' | 'segments';
export type LoyaltyTier = 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LoyaltyProgram {
  id: string;
  ownerUid: string;
  programType: 'airline' | 'hotel' | 'car_rental' | 'credit_card' | 'other';
  programName: string;      // e.g. "Delta SkyMiles"
  memberNumber?: string;
  balance: number;
  unit: LoyaltyUnit;
  tier?: LoyaltyTier;
  expiryDate?: string;      // ISO 8601 date
  isManual: boolean;        // true = user entered manually, false = scanned/synced
  createdAt: string;
}
