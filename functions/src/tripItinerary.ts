/**
 * Which trips have a real itinerary (owner, 2026-10-25: the feed showed empty "Trip to Rome"s). The stop count lives in
 * server-only `tripStats/{tripId}`; the trip doc gets `hasItinerary` only when the count crosses ITINERARY_MIN_STOPS,
 * so adding stops doesn't rewrite the trip (every trip write re-syncs Algolia and runs the trip triggers). Pure.
 */
export const ITINERARY_MIN_STOPS = 3;

/** The new `hasItinerary` when a stop count moves from `before` to `after`, or null when the flag doesn't change. */
export function itineraryFlagChange(before: number, after: number): boolean | null {
  const was = before >= ITINERARY_MIN_STOPS;
  const now = Math.max(0, after) >= ITINERARY_MIN_STOPS;
  return was === now ? null : now;
}
