import type { DmThreadType, DmTripSnapshot, TripVisibility } from '@/types';
import { formatRangeLabel } from '@/utils/dateRange';
import { tripPlaceLabel } from '@/utils/tripRegion';

interface DateLike {
  toDate(): Date;
}

export interface ShareableTrip {
  id: string;
  title: string;
  coverImageUrl?: string | null;
  destination: { name: string };
  additionalDestinations?: { name: string }[];
  regionName?: string | null;
  startDate?: DateLike | null;
  endDate?: DateLike | null;
}

/** Private and moderation-hidden trips can't be shared: nobody else could open them. */
export function canShareTrip(trip: { visibility: TripVisibility; moderationHidden?: boolean }): boolean {
  return trip.visibility !== 'private' && !trip.moderationHidden;
}

/** The same path as the app route, so a universal link opens app/trip/[id]. */
export function tripShareUrl(tripId: string): string {
  return `https://supernova-a2125.web.app/trip/${tripId}`;
}

/** A trip message. `text` is always set: 1.0.2 and earlier read only `text`,
 * so without a note it says what was shared and links it. */
export function tripMessagePayload(a: { trip: ShareableTrip; note: string; senderUid: string }): {
  senderUid: string;
  text: string;
  trip: DmTripSnapshot;
} {
  const note = a.note.trim();
  const { trip } = a;
  const dateRange = trip.startDate && trip.endDate
    ? formatRangeLabel(trip.startDate.toDate(), trip.endDate.toDate())
    : null;
  return {
    senderUid: a.senderUid,
    text: note || `Shared a trip: ${trip.title} — ${tripShareUrl(trip.id)}`,
    trip: {
      tripId: trip.id,
      title: trip.title,
      coverImageUrl: trip.coverImageUrl ?? null,
      placeLabel: tripPlaceLabel(trip),
      dateRange,
      note: note.length > 0,
    },
  };
}

export interface ShareRecipient {
  uid: string;
  /** The existing one-to-one conversation, or null when one must be created. */
  threadId: string | null;
}

/** Who the send sheet lists: recent one-to-one conversations first, then
 * mutual friends without one. Each person once; blocked people never. */
export function shareRecipients(
  threads: { id: string; type: DmThreadType; participants: string[]; lastMessageAt?: { toMillis(): number } | null }[],
  mutualFriendUids: string[],
  me: string,
  blocked: Set<string>,
): ShareRecipient[] {
  const out: ShareRecipient[] = [];
  const seen = new Set<string>([me]);
  const direct = threads
    .filter((t) => t.type === 'direct')
    .sort((a, b) => (b.lastMessageAt?.toMillis() ?? 0) - (a.lastMessageAt?.toMillis() ?? 0));
  for (const t of direct) {
    const other = t.participants.find((p) => p !== me);
    if (!other || seen.has(other) || blocked.has(other)) continue;
    seen.add(other);
    out.push({ uid: other, threadId: t.id });
  }
  for (const uid of mutualFriendUids) {
    if (seen.has(uid) || blocked.has(uid)) continue;
    seen.add(uid);
    out.push({ uid, threadId: null });
  }
  return out;
}
