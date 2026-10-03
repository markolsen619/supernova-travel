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

/** The message rule caps a snapshot's title; trip titles themselves have no limit. */
const MAX_TITLE = 200;

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
    // With a note, the link still follows it: an older app shows no card.
    text: note ? `${note}\n${tripShareUrl(trip.id)}` : `Shared a trip: ${trip.title} — ${tripShareUrl(trip.id)}`,
    trip: {
      tripId: trip.id,
      title: trip.title.length > MAX_TITLE ? `${trip.title.slice(0, MAX_TITLE - 1)}…` : trip.title,
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
  blocked: ReadonlySet<string>,
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

/** The send sheet's result line. A failed send is named, never retried silently. */
export function summarizeSends(results: { name: string; ok: boolean }[]): {
  sent: number;
  failedNames: string[];
  message: string;
} {
  const sentNames = results.filter((r) => r.ok).map((r) => r.name);
  const failedNames = results.filter((r) => !r.ok).map((r) => r.name);
  if (sentNames.length === 0) {
    return { sent: 0, failedNames, message: `Couldn't send to ${failedNames.join(', ')}. Check your connection and try again.` };
  }
  const head = sentNames.length === 1 ? `Sent to ${sentNames[0]}` : `Sent to ${sentNames.length} people`;
  const message = failedNames.length ? `${head}. Couldn't send to ${failedNames.join(', ')}.` : head;
  return { sent: sentNames.length, failedNames, message };
}

/** A trip message's note as its card shows it: without the trailing link it
 * carries for apps that predate cards. */
export function tripNoteText(message: { text: string; trip: { tripId: string } }): string {
  const suffix = `\n${tripShareUrl(message.trip.tripId)}`;
  return message.text.endsWith(suffix) ? message.text.slice(0, -suffix.length) : message.text;
}
