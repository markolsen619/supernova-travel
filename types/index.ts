import { Timestamp } from 'firebase/firestore';
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

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
  /** Set (client-writable, like every UserProfile field except `tier`) when
   * the Messages tab in app/notifications.tsx gains focus — the coarse
   * signal behind the heart icon's badge dot for new DMs. Per-thread read
   * state lives separately in dmThreads/{id}/reads/{uid}. */
  lastMessagesSeenAt: Timestamp | null;
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

export interface Destination {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  /** Bounding box used to constrain stop grounding to this city. Resolved once
   *  and persisted; null until then, and for trips created before this field. */
  bounds: PlaceViewportBounds | null;
}

export interface Trip {
  id: string;
  authorUid: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  destination: Destination;
  /** Additional stops beyond the primary destination, in visit order. Empty
   * for single-destination trips (the overwhelming majority). Capped at 9
   * (10 total including the primary) — see DestinationListEditor. Every
   * existing single-destination consumer (cover photo, map, packing
   * templates, Algolia sync, TripCard) intentionally reads only
   * `destination` and ignores this field — see the Phase 1 spec's "out of
   * scope" list. */
  additionalDestinations: Destination[];
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  visibility: TripVisibility;
  /** uids of accepted trip invitees — see TripInvite. Only ever written by
   * the `respondToTripInvite` Cloud Function (arrayUnion on accept), never
   * directly by the client. Firestore rules already gate every trip
   * subcollection's read/write on membership here, so accepting an invite
   * is what grants access to the itinerary, budget, and packing list alike. */
  collaborators: string[];
  isAiGenerated: boolean;
  status: TripStatus;
  tags: string[];
  likesCount: number;
  savesCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Set once via EditTripSheet or the budget screen's own prompt — null
   * until the owner sets one. A single currency for the whole trip (see
   * Expense — v1 doesn't support mixed-currency expenses). */
  budgetAmount: number | null;
  budgetCurrency: string | null;
}

export interface Follow {
  followerUid: string;
  followeeUid: string;
  createdAt: Timestamp;
}

// ── Trip invites & notifications ────────────────────────────────────────────

export type TripInviteStatus = 'pending' | 'accepted' | 'declined';

/** `trips/{tripId}/invites/{inviteeUid}` — doc ID is the invitee's own uid,
 * so a re-invite structurally overwrites rather than duplicating. Written
 * only by the `inviteToTrip`/`respondToTripInvite` Cloud Functions (Admin
 * SDK) — accepting mutates the parent trip's `collaborators[]`, which a
 * client-side rule can't safely allow a non-collaborator to do themselves. */
export interface TripInvite {
  id: string; // == inviteeUid
  inviterUid: string;
  status: TripInviteStatus;
  createdAt: Timestamp;
  respondedAt: Timestamp | null;
}

/** `users/{uid}/notifications/{autoId}` — discriminated union so future
 * notification types (likes, comments, follows) slot in without a
 * migration. Written only by Cloud Functions (Admin SDK); see
 * firestore.rules `notifications` write: false. */
export interface TripInviteNotification {
  id: string;
  type: 'trip_invite';
  tripId: string;
  tripTitle: string;
  inviterUid: string;
  inviterName: string;
  inviterAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface TripInviteAcceptedNotification {
  id: string;
  type: 'trip_invite_accepted';
  tripId: string;
  tripTitle: string;
  accepterUid: string;
  accepterName: string;
  accepterAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface PostLikeNotification {
  id: string;
  type: 'post_like';
  postId: string;
  postCoverUrl: string | null;
  likerUid: string;
  likerName: string;
  likerAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface PostCommentNotification {
  id: string;
  type: 'post_comment';
  postId: string;
  postCoverUrl: string | null;
  commentText: string;
  commenterUid: string;
  commenterName: string;
  commenterAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export type AppNotification =
  | TripInviteNotification
  | TripInviteAcceptedNotification
  | PostLikeNotification
  | PostCommentNotification;

// ── Direct messaging ─────────────────────────────────────────────────────

export type DmThreadType = 'direct' | 'group';

/** `dmThreads/{threadId}` — created only via the `createDmThread` Cloud
 * Function (Admin SDK); see firestore.rules `dmThreads` create/update: if
 * false. `threadId` is a deterministic sorted pair for `type: 'direct'`
 * (get-or-create, so "Message" always resolves to the same thread), or an
 * auto-generated ID for `type: 'group'`. */
export interface DmThread {
  id: string;
  type: DmThreadType;
  participants: string[];
  createdByUid: string;
  createdAt: Timestamp;
  lastMessageText: string | null;
  lastMessageAt: Timestamp | null;
  lastMessageSenderUid: string | null;
}

/** `dmThreads/{threadId}/messages/{messageId}` — client-writable directly
 * (no callable needed to send), append-only. */
export interface DmMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Timestamp;
}

// ── Budget & expenses ───────────────────────────────────────────────────────

export type ExpenseCategory = 'food' | 'lodging' | 'transport' | 'activities' | 'shopping' | 'other';

/** `trips/{tripId}/expenses/{expenseId}` — a shared ledger, not a payment
 * rail: this tracks who paid and who the cost should split among, it never
 * moves money. Any collaborator can add/edit/delete, same trust model as
 * splitting a real bill together (firestore.rules mirrors `days`). */
export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  /** uid of whoever actually paid. */
  paidByUid: string;
  /** uids the cost splits evenly among (v1: equal split only) — usually
   * every current trip member, but editable per-expense (e.g. a solo
   * activity only one person did). */
  splitAmongUids: string[];
  createdByUid: string;
  createdAt: Timestamp;
}

// ── Packing list ────────────────────────────────────────────────────────────

/** `trips/{tripId}/packingItems/{itemId}` — generated once from
 * services/packingTemplates.ts on first open (owner-gated, mirrors
 * useTripCoverResolver's silent-once-owner-only precedent), then editable by
 * any collaborator. Being a collaborator IS the "share this list" mechanism
 * — same as expenses and the itinerary itself, no separate share action. */
export interface PackingItem {
  id: string;
  label: string;
  /** Free-text category key (e.g. "Essentials", "Beach gear") — not an enum,
   * since services/packingTemplates.ts's category set can grow without a
   * type/rules change, and a manually-added item can invent its own. */
  category: string;
  checked: boolean;
  /** false for generated-template items, true for anything the user typed
   * in themselves — display-only distinction, not access control. */
  isCustom: boolean;
  addedByUid: string;
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
  /**
   * Manual visited-tracking (TM-2) — no GPS, set only by the owner tapping
   * "Mark visited". `visitedAt` is reset to null (not omitted) on unvisit,
   * so every activity has a consistent shape to query/derive from later —
   * a future feed post can be built directly from
   * `trip.days[].activities[].filter(a => a.visited)` (title, mediaUrls,
   * placeId/lat/lng, notes-as-caption) with no migration, since tracking
   * lives on the same document the feed would read.
   */
  visited: boolean;
  visitedAt: Timestamp | null;
  /** Set when both providers failed to ground this stop. Prevents the
   *  automatic pass from re-billing an unresolvable stop on every trip open —
   *  the previous in-memory set died on unmount, which was harmless only while
   *  grounding was user-initiated. */
  groundingFailedAt: Timestamp | null;
}

export interface TripDay {
  id: string;
  dayNumber: number;
  /** Which destination this day belongs to, for multi-city trips. Null on
   *  older trips; resolveDayDestinationIndices() infers those. */
  destinationIndex: number | null;
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
  destination: Destination;
  additionalDestinations: Destination[];
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
  destination?: Destination;
  additionalDestinations?: Destination[];
  visibility?: TripVisibility;
  tags?: string[];
  startDate?: Date | null;
  endDate?: Date | null;
  status?: TripStatus;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
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
  terminal?: string;        // new — not yet populated by any automated flow; manual entry only until the future flight-monitoring project
  barcode?: string;         // raw barcode string
  barcodeFormat?: BarcodeFormat;
  status: BoardingPassStatus;
  createdAt: string;        // ISO 8601
}

export type ReservationType = 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show';

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
