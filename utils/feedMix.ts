/**
 * The feed never runs dry (spec 2026-10-24-seed-social-design.md): a trip card after every 3 posts, trip cards
 * continuing once the posts run out, and a "Travelers to follow" page at index 2 for people who follow few.
 */
export type FeedTrip = {
  id: string; authorUid: string; title: string; coverImageUrl: string | null; destinationName: string; days: number | null;
  isEditorial: boolean; savesCount: number; createdAtMs: number; moderationHidden?: boolean;
  /** Server-set once a trip has 3+ stops (functions/src/tripItinerary.ts); absent or false = not shown. */
  hasItinerary?: boolean;
};
export type FeedItem<P> = { kind: 'post'; post: P } | { kind: 'trip'; trip: FeedTrip } | { kind: 'suggestions' };

export const TRIP_EVERY = 3;
export const SUGGESTIONS_AT = 2;

/** Travelers' trips newest first, then Supernova picks by saves; a cover is required and your own trips never show. */
export function feedTripPool(trips: FeedTrip[], selfUid: string | null): FeedTrip[] {
  // Only real itineraries: nobody wants to open a trip card and find no plan inside.
  const ok = trips.filter((t) => !!t.coverImageUrl && t.authorUid !== selfUid && t.hasItinerary === true);
  const travelers = ok.filter((t) => !t.isEditorial).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const picks = ok.filter((t) => t.isEditorial).sort((a, b) => b.savesCount - a.savesCount);
  return [...travelers, ...picks];
}

export function mixFeed<P extends { id: string; tripId?: string | null }>(
  posts: P[], trips: FeedTrip[], opts: { postsExhausted: boolean; showSuggestions: boolean; every?: number },
): FeedItem<P>[] {
  const every = opts.every ?? TRIP_EVERY;
  // A trip is skipped only if a post *before its slot* already showed it, so a trip card never changes when
  // a later page of posts arrives (it would swap the card someone is looking at).
  const shownAsPost = new Set<string>();
  const queue = [...trips];
  const nextTrip = () => {
    while (queue.length && shownAsPost.has(queue[0].id)) queue.shift();
    return queue.shift();
  };
  const out: FeedItem<P>[] = [];
  posts.forEach((post, i) => {
    out.push({ kind: 'post', post });
    if (post.tripId) shownAsPost.add(post.tripId);
    if ((i + 1) % every === 0) {
      const t = nextTrip();
      if (t) out.push({ kind: 'trip', trip: t });
    }
  });
  if (opts.postsExhausted) for (let t = nextTrip(); t; t = nextTrip()) out.push({ kind: 'trip', trip: t });
  if (opts.showSuggestions) out.splice(Math.min(SUGGESTIONS_AT, out.length), 0, { kind: 'suggestions' });
  return out;
}

/** `LISBON · 5 DAYS` above a trip card's title; older trips without a place show only the length. */
export function tripEyebrow(trip: FeedTrip): string {
  const place = trip.destinationName.trim().toUpperCase();
  const length = trip.days ? `${trip.days} ${trip.days === 1 ? 'DAY' : 'DAYS'}` : '';
  return [place, length].filter(Boolean).join(' · ');
}

/** The card's heading, never blank: the title, else "Trip to {place}", else "A trip". */
export function tripTitle(trip: FeedTrip): string {
  if (trip.title.trim()) return trip.title.trim();
  return trip.destinationName.trim() ? `Trip to ${trip.destinationName.trim()}` : 'A trip';
}
