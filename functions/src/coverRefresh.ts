/**
 * Cover photos that stop loading (2026-11-01): trip and destination covers are stored as Places photo URLs, and
 * Google treats the photo reference inside them as temporary — after a few weeks it answers "photo resource
 * invalid" and the card shows its fallback. Every stored URL still names its place, so the photo is looked up
 * again and the URL rewritten in the same shape (refreshCovers daily, refreshCover on demand). Google's terms
 * don't allow keeping our own copies of the images. Pure.
 */
export const REFRESH_AFTER_MS = 20 * 86_400_000;

export function parsePlacesPhotoUrl(url: unknown): { placeId: string; key: string; maxWidthPx: number } | null {
  if (typeof url !== 'string') return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const m = /^\/v1\/places\/([^/]+)\/photos\/[^/]+\/media$/.exec(u.pathname);
  const key = u.searchParams.get('key');
  if (u.host !== 'places.googleapis.com' || !m || !key) return null;
  const w = Number(u.searchParams.get('maxWidthPx'));
  return { placeId: decodeURIComponent(m[1]), key, maxWidthPx: Number.isFinite(w) && w > 0 ? w : 1200 };
}

export const photoUrlFrom = (photoName: string, key: string, maxWidthPx: number) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${key}`;

export const needsRefresh = (refreshedAtMs: number | undefined, nowMs: number) =>
  typeof refreshedAtMs !== 'number' || nowMs - refreshedAtMs > REFRESH_AFTER_MS;

/** The place's first photo name from a Place Details answer, only in Google's own `places/…/photos/…` form. */
export function firstPhotoName(details: unknown): string | null {
  const photos = (details as { photos?: { name?: unknown }[] } | null)?.photos;
  const name = Array.isArray(photos) ? photos[0]?.name : null;
  return typeof name === 'string' && /^places\/[^/]+\/photos\/[^/]+$/.test(name) ? name : null;
}
