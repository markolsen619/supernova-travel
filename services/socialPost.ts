/**
 * Social wish list — the app's calls (spec 2026-11-06-social-wishlist-design.md): `readSocialPost` (the server reads
 * the post and finds its places) and the post's cover, fetched fresh from TikTok's public oEmbed (free, no key; covers
 * are never stored — TikTok's links expire).
 */
import { httpsCallable } from 'firebase/functions';
import { collection, doc } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import { parseOembed, type WishSave } from '@/utils/wishlist';

type ReadResult = Omit<WishSave, 'savedAtMs' | 'platform'> & { coverUrl: string | null };

async function fetchJson(url: string, ms = 6000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * The post as the phone reads it from TikTok's public oEmbed (device test 2026-11-08: TikTok answered our server with
 * nothing). A short link that oEmbed won't take is followed on the phone first. Null when TikTok can't be reached.
 */
export async function readPostOnDevice(url: string): Promise<ReturnType<typeof parseOembed>> {
  const direct = parseOembed(await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`));
  if (direct?.caption || direct?.coverUrl) return direct;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (r.url && r.url !== url) return parseOembed(await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(r.url)}`)) ?? direct;
  } catch { /* offline or blocked */ }
  return direct;
}

export async function readSocialPost(url: string): Promise<WishSave & { coverUrl: string | null }> {
  const requestId = doc(collection(db, '_')).id; // a Firestore auto-id; the server's per-video limit makes retries free
  const hint = await readPostOnDevice(url);
  const { data } = await httpsCallable<{ url: string; requestId: string; hint: unknown }, ReadResult>(functions, 'readSocialPost', { timeout: 60_000 })({ url, requestId, hint });
  return { ...data, coverUrl: data.coverUrl ?? hint?.coverUrl ?? null, platform: 'tiktok', savedAtMs: Date.now() };
}

const covers = new Map<string, Promise<string | null>>();

/** The post's current cover image, or null; asked once per post per session. */
export function tiktokCover(postUrl: string): Promise<string | null> {
  if (!covers.has(postUrl)) {
    covers.set(postUrl, fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { thumbnail_url?: unknown }).thumbnail_url : null))
      .then((u) => (typeof u === 'string' && u.startsWith('https://') ? u : null))
      .catch(() => null));
  }
  return covers.get(postUrl)!;
}
