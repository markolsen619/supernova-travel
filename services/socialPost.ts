/**
 * Social wish list — the app's calls (spec 2026-11-06-social-wishlist-design.md): `readSocialPost` (the server reads
 * the post and finds its places) and the post's cover, fetched fresh from TikTok's public oEmbed (free, no key; covers
 * are never stored — TikTok's links expire).
 */
import { httpsCallable } from 'firebase/functions';
import { collection, doc } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import type { WishSave } from '@/utils/wishlist';

type ReadResult = Omit<WishSave, 'savedAtMs' | 'platform'> & { coverUrl: string | null };

export async function readSocialPost(url: string): Promise<WishSave & { coverUrl: string | null }> {
  const requestId = doc(collection(db, '_')).id; // a Firestore auto-id: a retry of this call never counts twice
  const { data } = await httpsCallable<{ url: string; requestId: string }, ReadResult>(functions, 'readSocialPost', { timeout: 60_000 })({ url, requestId });
  return { ...data, platform: 'tiktok', savedAtMs: Date.now() };
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
