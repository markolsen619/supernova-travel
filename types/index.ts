import { Timestamp } from 'firebase/firestore';

export type Tier = 'free' | 'pro' | 'business';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface UserProfile {
  uid: string;
  displayName: string;
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

export type PostMediaType = 'photo' | 'video';

export interface Post {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  caption: string;
  mediaType: PostMediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  placeName: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  tripId: string | null;
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
