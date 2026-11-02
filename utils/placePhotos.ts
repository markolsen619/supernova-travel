/**
 * Place photos without a per-view bill (2026-11-01): October's whole $45 Places bill was 7,428 Place Photo loads —
 * every <Image> pointed at a keyed `…/media?key=` URL is a billed request, on every phone, every time. Instead ask
 * once for Google's key-less address (`skipHttpRedirect`), share it through the `places/{placeId}` cache for 10 days
 * (Google calls it short-lived), and draw that. Pure; services/places/placePhotos.ts does the fetching.
 */
export const PHOTO_RAIL_MAX = 4;
export const PHOTO_URI_TTL_MS = 10 * 86_400_000;

export const photoUriRequestUrl = (photoName: string, maxWidthPx: number, key: string) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${key}`;

function isPhotoUri(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(u.host) && !u.searchParams.has('key');
  } catch {
    return false;
  }
}

/** The key-less address from a skipHttpRedirect answer, or null. */
export const parsePhotoUri = (json: unknown): string | null => {
  const v = (json as { photoUri?: unknown } | null)?.photoUri;
  return isPhotoUri(v) ? v : null;
};

/** Cached addresses still worth using (younger than 10 days, all valid), else null. */
export function freshPhotoUris(cached: { photoUris?: unknown; photoUrisAtMs?: unknown } | null | undefined, nowMs: number): string[] | null {
  const uris = cached?.photoUris, at = cached?.photoUrisAtMs;
  if (!Array.isArray(uris) || !uris.length || typeof at !== 'number' || nowMs - at > PHOTO_URI_TTL_MS) return null;
  return uris.every(isPhotoUri) ? (uris as string[]) : null;
}
