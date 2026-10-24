/**
 * The feed never runs dry (spec 2026-10-24-seed-social-design.md): a trip card after every 3 posts, trip cards
 * continuing once the posts run out, and a "Travelers to follow" page at index 2 for people who follow few.
 */
export type FeedTrip = {
  id: string; authorUid: string; title: string; coverImageUrl: string | null; destinationName: string; days: number | null;
  isEditorial: boolean; savesCount: number; createdAtMs: number; moderationHidden?: boolean;
};
export type FeedItem<P> = { kind: 'post'; post: P } | { kind: 'trip'; trip: FeedTrip } | { kind: 'suggestions' };

export const TRIP_EVERY = 3;
export const SUGGESTIONS_AT = 2;

/** Travelers' trips newest first, then Supernova picks by saves; a cover is required and your own trips never show. */
export function feedTripPool(trips: FeedTrip[], selfUid: string | null): FeedTrip[] {
  const ok = trips.filter((t) => !!t.coverImageUrl && t.authorUid !== selfUid);
  const travelers = ok.filter((t) => !t.isEditorial).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const picks = ok.filter((t) => t.isEditorial).sort((a, b) => b.savesCount - a.savesCount);
  return [...travelers, ...picks];
}

export function mixFeed<P extends { id: string; tripId?: string | null }>(
  posts: P[], trips: FeedTrip[], opts: { postsExhausted: boolean; showSuggestions: boolean; every?: number },
): FeedItem<P>[] {
  const every = opts.every ?? TRIP_EVERY;
  const inPosts = new Set(posts.map((p) => p.tripId).filter(Boolean));
  const queue = trips.filter((t) => !inPosts.has(t.id));
  const out: FeedItem<P>[] = [];
  posts.forEach((post, i) => {
    out.push({ kind: 'post', post });
    if ((i + 1) % every === 0 && queue.length) out.push({ kind: 'trip', trip: queue.shift()! });
  });
  if (opts.postsExhausted) for (const trip of queue) out.push({ kind: 'trip', trip });
  if (opts.showSuggestions) out.splice(Math.min(SUGGESTIONS_AT, out.length), 0, { kind: 'suggestions' });
  return out;
}

/** `LISBON · 5 DAYS` above a trip card's title. */
export function tripEyebrow(trip: FeedTrip): string {
  const place = trip.destinationName.toUpperCase();
  if (!trip.days) return place;
  return `${place} · ${trip.days} ${trip.days === 1 ? 'DAY' : 'DAYS'}`;
}
