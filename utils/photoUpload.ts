/**
 * How a post photo is prepared before upload (services/postMedia.ts): a JPEG with its long side capped at
 * 2048 px, quality 0.8. Before 2026-10-23 photos went up as picked — HEIC that Android can't draw (black
 * cards), 3–7 MB each, and with the place they were taken in their metadata. Re-encoding fixes all three.
 */
export const PHOTO_MAX_PX = 2048;
export const PHOTO_QUALITY = 0.8;

/** The resize to apply (by the long side), or null when the photo already fits or its size is unknown. */
export function uploadResize(width: number, height: number, max = PHOTO_MAX_PX): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}
