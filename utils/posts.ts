/** Excludes trip-share posts (mediaType: 'trip') from a post list. Trip
 * shares already appear in the profile's Trips tab (sourced from the
 * `trips` collection directly), so showing them again in a Posts grid
 * would double up the same trip. See
 * docs/superpowers/specs/2026-07-28-post-categorization-and-editing-design.md. */
export function excludeTripShares<T extends { mediaType?: string }>(posts: T[]): T[] {
  return posts.filter((p) => p.mediaType !== 'trip');
}
