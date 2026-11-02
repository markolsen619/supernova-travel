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

/**
 * Covers as Google's key-less photo address (2026-11-01: October's whole $45 Places bill was 7,428 Place Photo
 * loads — every card drawing a keyed media URL is a billed request, on every phone, every time). One billed lookup
 * per refresh (`skipHttpRedirect`), then free to view. Google calls the address short-lived, so it's refreshed every
 * 10 days, and a card that fails to load still asks `refreshCover` for a fresh one.
 */
export const PHOTO_URI_REFRESH_MS = 10 * 86_400_000;

type CoverDoc = { coverImageUrl?: unknown; coverPlaceId?: unknown; coverRefreshedAtMs?: unknown };

/** The place a cover is refreshed by: the saved `coverPlaceId`, else the one inside an older keyed URL. */
export function coverPlaceId(doc: CoverDoc): string | null {
  if (typeof doc.coverPlaceId === 'string' && doc.coverPlaceId) return doc.coverPlaceId;
  return parsePlacesPhotoUrl(doc.coverImageUrl)?.placeId ?? null;
}

/** A keyed URL is always due (it bills each view); a photo address once it's 10 days old. */
export function coverDue(doc: CoverDoc, nowMs: number): boolean {
  if (parsePlacesPhotoUrl(doc.coverImageUrl)) return true;
  if (!coverPlaceId(doc)) return false;
  const at = doc.coverRefreshedAtMs;
  return typeof at !== 'number' || nowMs - at > PHOTO_URI_REFRESH_MS;
}

export const photoUriRequest = (photoName: string, key: string, maxWidthPx: number) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${key}`;

/** The `photoUri` of a skipHttpRedirect answer, only an https googleusercontent address (never anything keyed). */
export function photoUriFrom(json: unknown): string | null {
  const v = (json as { photoUri?: unknown } | null)?.photoUri;
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(u.host) && !u.searchParams.has('key') ? v : null;
  } catch {
    return null;
  }
}
