/**
 * Place photos & reviews (docs/superpowers/specs/2026-10-09-place-reviews-design.md).
 * Pure — no firebase-admin — so it is unit-tested; placeReviewFunctions.ts applies it.
 */
export interface ReviewForStats {
  id: string;
  rating: number | null;
  photoUrls: string[];
  updatedAtMs: number;
  moderationHidden: boolean;
}

export interface PlaceStats {
  reviewCount: number;
  ratingCount: number;
  ratingSum: number;
  photoCount: number;
  latestPhotos: { url: string; reviewId: string }[];
}

const MAX_LATEST = 12;

/** A place's totals, recomputed from its reviews (hidden ones don't count). */
export function placeStatsFrom(reviews: ReviewForStats[]): PlaceStats {
  const shown = reviews.filter((r) => !r.moderationHidden);
  const rated = shown.filter((r) => typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5);
  const newest = [...shown].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return {
    reviewCount: shown.length,
    ratingCount: rated.length,
    ratingSum: rated.reduce((s, r) => s + (r.rating as number), 0),
    photoCount: shown.reduce((s, r) => s + r.photoUrls.length, 0),
    latestPhotos: newest.flatMap((r) => r.photoUrls.map((url) => ({ url, reviewId: r.id }))).slice(0, MAX_LATEST),
  };
}
