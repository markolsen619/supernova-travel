/**
 * Social wish list — the app's calls (spec 2026-11-06-social-wishlist-design.md): `readSocialPost` (the server reads
 * the post and finds its places), with the phone's own reading sent as a hint. Covers of saved posts come from the
 * server (`hooks/useWishCovers`, spec 2026-11-10 §3) — TikTok gives the phone no post.
 */
import { httpsCallable } from 'firebase/functions';
import { collection, doc } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import { embedMetaFromHtml, oembedLink, parseOembed, tiktokPostId, type WishSave } from '@/utils/wishlist';

type ReadResult = Omit<WishSave, 'savedAtMs' | 'platform'> & { coverUrl: string | null };

async function fetchText(url: string, ms = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** The post as TikTok's embed page shows it — photo posts get only their id from oEmbed (device test 2026-11-09). */
async function readEmbed(videoId: string | null) {
  if (!videoId) return null;
  const html = await fetchText(`https://www.tiktok.com/embed/v2/${videoId}`);
  return html ? embedMetaFromHtml(html, videoId) : null;
}

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

/** A short link (vm./vt./tiktok.com/t/) followed on the phone, where TikTok treats it as a person, not a server. */
async function resolveOnDevice(url: string): Promise<string | null> {
  if (tiktokPostId(url)) return url;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    return r.url || null;
  } catch {
    return null;
  }
}

/**
 * The post as the phone reads it — its resolved link, video id, caption, creator and cover from TikTok's public oEmbed
 * (device tests 2026-11-08/09: TikTok answered our server with nothing, and sent its short-link requests to a page
 * without the video). Null fields when TikTok can't be reached.
 */
export async function readPostOnDevice(url: string): Promise<(NonNullable<ReturnType<typeof parseOembed>> & { resolvedUrl: string | null }) | null> {
  const resolvedUrl = await resolveOnDevice(url);
  const oembed = parseOembed(await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(oembedLink(resolvedUrl ?? url))}`))
    ?? (resolvedUrl && resolvedUrl !== url ? parseOembed(await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)) : null);
  const embed = oembed?.caption ? null : await readEmbed(oembed?.videoId ?? (resolvedUrl ? tiktokPostId(resolvedUrl) : null));
  const meta = embed?.caption ? embed : oembed;
  if (!meta && !resolvedUrl) return null;
  return { caption: '', author: '', authorHandle: '', coverUrl: null, videoId: null, ...(meta ?? {}), resolvedUrl };
}

export async function readSocialPost(url: string): Promise<WishSave & { coverUrl: string | null }> {
  const requestId = doc(collection(db, '_')).id; // a Firestore auto-id; the server's per-video limit makes retries free
  const hint = await readPostOnDevice(url);
  const { data } = await httpsCallable<{ url: string; requestId: string; hint: unknown }, ReadResult>(functions, 'readSocialPost', { timeout: 60_000 })({ url, requestId, hint });
  return { ...data, coverUrl: data.coverUrl ?? hint?.coverUrl ?? null, platform: 'tiktok', savedAtMs: Date.now() };
}
