/**
 * Social wish list — the server's rules (spec docs/superpowers/specs/2026-11-06-social-wishlist-design.md): TikTok
 * links, the AI's place list, the monthly limit and picking a geocoder result. Pure; socialPostFunctions.ts calls out.
 */
export type PlaceKind = 'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other';
export interface FoundPlace { name: string; kind: PlaceKind; city: string | null }
export interface PlacesAnswer { city: string | null; country: string | null; places: FoundPlace[] }
const KINDS: PlaceKind[] = ['restaurant', 'bar', 'cafe', 'sight', 'hotel', 'activity', 'shop', 'other'];

export const isTikTokHost = (host: string) => /^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/i.test(host);

function parse(url: string): URL | null { try { return new URL(url); } catch { return null; } }

export function tiktokVideoId(url: string): string | null {
  const u = parse(url);
  if (!u || !isTikTokHost(u.hostname)) return null;
  // Photo posts (slideshows) live at /@user/photo/{id} (device test 2026-11-09) — the same id space as videos.
  const m = /\/(?:video|photo)\/(\d{8,25})/.exec(u.pathname) ?? /\/v\/(\d{8,25})\.html/.exec(u.pathname);
  return m ? m[1] : null;
}

/** The link to give oEmbed: it refuses /photo/ links (400) but answers the same post written as /video/. */
export const oembedTarget = (url: string) => url.replace(/\/photo\/(\d{8,25})/, '/video/$1');

export interface EmbedMeta { caption: string; author: string; authorHandle: string; coverUrl: string | null }

/**
 * Caption, creator and cover from TikTok's public embed page (`/embed/v2/{id}`) — for photo posts oEmbed gives only
 * the id (device test 2026-11-09). Null when the page doesn't carry the post.
 */
export function parseEmbedPage(html: string): EmbedMeta | null {
  const m = /<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let state: unknown;
  try { state = JSON.parse(m[1]); } catch { return null; }
  const data = (state as { source?: { data?: Record<string, { videoData?: unknown }> } })?.source?.data ?? {};
  const entry = Object.entries(data).find(([k, v]) => k.startsWith('/embed/v2/') && v && typeof v === 'object' && v.videoData);
  if (!entry) return null;
  const vd = entry[1].videoData as { itemInfos?: { text?: unknown; covers?: unknown }; authorInfos?: { uniqueId?: unknown; nickName?: unknown } };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cover = Array.isArray(vd.itemInfos?.covers) ? str(vd.itemInfos!.covers[0]) : '';
  return {
    caption: str(vd.itemInfos?.text), author: str(vd.authorInfos?.nickName), authorHandle: str(vd.authorInfos?.uniqueId),
    coverUrl: /^https:\/\/\S+$/.test(cover) ? cover : null,
  };
}

export function isShortTikTok(url: string): boolean {
  const u = parse(url);
  return !!u && isTikTokHost(u.hostname) && (/^(vm|vt)\./i.test(u.hostname) || u.pathname.startsWith('/t/'));
}

export const trimCaption = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 300) : '');

export const PLACES_SYSTEM = [
  'You read the caption of a short travel video and list the specific places it names: restaurants, bars, cafes,',
  'sights, hotels, activities, shops. Only places the text actually names — never guess from the topic. For each,',
  'its city when the text says or clearly implies it. Also the main city and country of the video, or null.',
  'At most 10 places. Names exactly as written (keep accents).',
].join(' ');

export const PLACES_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', nullable: true }, country: { type: 'string', nullable: true },
    places: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, kind: { type: 'string', enum: KINDS }, city: { type: 'string', nullable: true },
    }, required: ['name', 'kind', 'city'] } },
  },
  required: ['city', 'country', 'places'],
};

export const placesPrompt = (caption: string, authorHandle: string) => `Creator: @${authorHandle || 'unknown'}\nCaption: ${caption || '(none)'}`;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parsePlacesAnswer(text: unknown): PlacesAnswer | null {
  let o: unknown;
  try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  const a = o as { city?: unknown; country?: unknown; places?: unknown } | null;
  if (!a || !Array.isArray(a.places)) return null;
  return {
    city: str(a.city), country: str(a.country),
    places: a.places.map((p) => {
      const q = p as { name?: unknown; kind?: unknown; city?: unknown };
      return { name: typeof q.name === 'string' ? q.name : '', kind: KINDS.includes(q.kind as PlaceKind) ? (q.kind as PlaceKind) : 'other', city: str(q.city) };
    }),
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cleanPlaces(a: PlacesAnswer): PlacesAnswer {
  const seen = new Set<string>();
  const banned = new Set([a.city, a.country].filter((x): x is string => !!x).map(fold));
  const places: FoundPlace[] = [];
  for (const p of a.places) {
    const name = p.name.replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = fold(name);
    if (!key || banned.has(key) || seen.has(key)) continue;
    seen.add(key);
    places.push({ ...p, name });
    if (places.length === 10) break;
  }
  return { ...a, places };
}

export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);
export const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13);
export type QuotaDoc = { videos?: string[]; hours?: Record<string, number> };
export const FREE_MONTHLY = 20;
export const HOURLY = 30;

export function wishQuota(doc: QuotaDoc, videoId: string, paid: boolean, nowMs: number):
  { ok: true; counted: boolean; patch: QuotaDoc } | { ok: false; reason: 'monthly' | 'hourly' } {
  const videos = doc.videos ?? [];
  if (videos.includes(videoId)) return { ok: true, counted: false, patch: doc };
  const h = hourKey(nowMs);
  const inHour = doc.hours?.[h] ?? 0;
  if (inHour >= HOURLY) return { ok: false, reason: 'hourly' };
  if (!paid && videos.length >= FREE_MONTHLY) return { ok: false, reason: 'monthly' };
  return { ok: true, counted: true, patch: { videos: [...videos, videoId], hours: { [h]: inHour + 1 } } };
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}

/** The geocoder result named like the place (shares its words) within `maxKm` of the city, else null. */
export function pickByName(name: string, features: { name: string; lat: number; lng: number }[], center: { lat: number; lng: number } | null, maxKm = 25): { lat: number; lng: number } | null {
  const want = fold(name).split(' ').filter((w) => w.length > 2);
  if (!want.length) return null;
  const scored = features
    .filter((f) => !center || km(center, f) <= maxKm)
    .map((f) => { const have = new Set(fold(f.name).split(' ')); return { f, hits: want.filter((w) => have.has(w)).length }; })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0] ? { lat: scored[0].f.lat, lng: scored[0].f.lng } : null;
}

/**
 * Only a real read goes in the shared cache (final review): with TikTok unreachable, rate-limited or the AI failing,
 * the empty answer would have told everyone who shared that video "No places named" for 30 days.
 */
export const shouldCachePost = (r: { oembedStatus: number; aiFailed: boolean; fromDevice?: boolean; hasCaption?: boolean }) =>
  r.oembedStatus === 200 && !r.aiFailed && !r.fromDevice && r.hasCaption !== false;

export interface PostHint { caption?: unknown; author?: unknown; authorHandle?: unknown; coverUrl?: unknown }
export interface PostMeta { caption: string; author: string; authorHandle: string; coverUrl: string | null; fromDevice: boolean }

const shortText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const httpsUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) && v.length <= 1000 ? v : null);

/**
 * The post's caption, creator and cover (device test 2026-11-08: TikTok's oEmbed answered the server with nothing, so the
 * sheet had no cover, caption or places). The server's own lookup when it worked; else what the phone read from the same
 * public oEmbed — cleaned, and marked `fromDevice` so it never enters the shared cache.
 */
export function postMeta(status: number, body: unknown, hint: PostHint | null, embed: EmbedMeta | null = null): PostMeta {
  const b = (body ?? {}) as { title?: unknown; author_name?: unknown; author_unique_id?: unknown; thumbnail_url?: unknown };
  const server: PostMeta | null = status === 200 && body
    ? { caption: trimCaption(b.title), author: shortText(b.author_name, 80), authorHandle: shortText(b.author_unique_id, 40), coverUrl: httpsUrl(b.thumbnail_url), fromDevice: false }
    : null;
  if (server?.caption) return server;
  // oEmbed answered without a caption (photo posts): TikTok's embed page, read by the server, then the phone.
  if (embed?.caption) return { caption: trimCaption(embed.caption), author: shortText(embed.author, 80), authorHandle: shortText(embed.authorHandle, 40), coverUrl: httpsUrl(embed.coverUrl), fromDevice: false };
  const phone: PostMeta | null = hint
    ? { caption: trimCaption(hint.caption), author: shortText(hint.author, 80), authorHandle: shortText(hint.authorHandle, 40), coverUrl: httpsUrl(hint.coverUrl), fromDevice: true }
    : null;
  if (phone?.caption || !server) return phone ?? { caption: '', author: '', authorHandle: '', coverUrl: null, fromDevice: false };
  return { ...server, coverUrl: server.coverUrl ?? httpsUrl(embed?.coverUrl) ?? phone?.coverUrl ?? null };
}

/**
 * The post's video id (device test 2026-11-09: TikTok sent our servers' short-link requests somewhere without one):
 * the server's own resolution, else the link the phone resolved (TikTok hosts only), else the id from TikTok's oEmbed
 * on the phone (digits only). Used as the wish-list doc id; the post's words still come from oEmbed.
 */
export function chooseVideoId(serverUrl: string, hint: { resolvedUrl?: unknown; videoId?: unknown } | null): string | null {
  const own = tiktokVideoId(serverUrl);
  if (own) return own;
  const resolved = typeof hint?.resolvedUrl === 'string' ? tiktokVideoId(hint.resolvedUrl) : null;
  if (resolved) return resolved;
  return typeof hint?.videoId === 'string' && /^\d{8,25}$/.test(hint.videoId) ? hint.videoId : null;
}
