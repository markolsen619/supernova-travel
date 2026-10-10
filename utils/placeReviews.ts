/**
 * Place photos & reviews — the app's rules
 * (docs/superpowers/specs/2026-10-09-place-reviews-design.md). Pure.
 */
export const MAX_REVIEW_TEXT = 1000;
export const MAX_REVIEW_PHOTOS = 6;

/** One review per person per place: writing again edits it. */
export function reviewId(placeId: string, uid: string): string {
  return `${placeId}_${uid}`;
}

/** What's wrong with a review before it's saved, or null. */
export function reviewProblem(r: { rating: number | null; text: string; photoCount: number }): string | null {
  if (r.rating !== null && (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5)) return 'Pick between 1 and 5 stars.';
  if (r.text.length > MAX_REVIEW_TEXT) return 'Keep it under 1,000 characters.';
  if (r.photoCount > MAX_REVIEW_PHOTOS) return 'Up to 6 photos.';
  if (r.rating === null && !r.text.trim() && r.photoCount === 0) return 'Add stars, a few words, or a photo.';
  return null;
}

/** The reviews a place sheet shows first: people who had it on a trip, then the newest. */
export function topReviews<T extends { visited?: boolean; updatedAtMs: number }>(reviews: T[], n: number): T[] {
  return [...reviews].sort((a, b) => Number(!!b.visited) - Number(!!a.visited) || b.updatedAtMs - a.updatedAtMs).slice(0, n);
}

/** "4.6 · 23 reviews". */
export function ratingLine(s: { ratingSum: number; ratingCount: number; reviewCount: number }): string {
  if (s.reviewCount === 0) return '';
  const count = `${s.reviewCount} review${s.reviewCount === 1 ? '' : 's'}`;
  return s.ratingCount > 0 ? `${(s.ratingSum / s.ratingCount).toFixed(1)} · ${count}` : count;
}
