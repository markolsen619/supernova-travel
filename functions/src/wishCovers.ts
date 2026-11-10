/**
 * Wish-list covers from the server (spec 2026-11-10 §3): TikTok answers the phone's fetches without the post, but our
 * servers read its embed page fine. Pure; wishCoverFunctions.ts calls out. Covers are links with TikTok's own expiry,
 * cached as their own field — no image is ever stored.
 */
const DAY_MS = 86_400_000;
export const COVER_MIN_LEFT_MS = 3_600_000;

/** Unique digits-only TikTok ids, at most 30 per call. */
export function cleanVideoIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is string => typeof v === 'string' && /^\d{8,25}$/.test(v)))].slice(0, 30);
}

/** When a TikTok CDN link stops working: its `x-expires` (seconds), else a day; never more than 14 days. */
export function coverExpiry(url: string, nowMs: number): number {
  let exp = NaN;
  try { exp = Number(new URL(url).searchParams.get('x-expires')) * 1000; } catch { /* not a URL */ }
  const at = Number.isFinite(exp) && exp > 0 ? exp : nowMs + DAY_MS;
  return Math.min(at, nowMs + 14 * DAY_MS);
}

/** A cached cover worth serving: an https link with more than an hour left. */
export function coverStillGood(cover: unknown, nowMs: number): cover is { url: string; expiresMs: number } {
  const c = cover as { url?: unknown; expiresMs?: unknown } | null;
  return !!c && typeof c.url === 'string' && c.url.startsWith('https://') && typeof c.expiresMs === 'number' && c.expiresMs - nowMs > COVER_MIN_LEFT_MS;
}
