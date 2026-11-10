/**
 * `readSocialPost` — a shared TikTok post → the places it names (spec 2026-11-06-social-wishlist-design.md). Order:
 * the link, consent, the monthly limit (claimed in a transaction before any AI call), the server cache by video, then
 * TikTok oEmbed → Gemini (caption and creator only) → Mapbox. Nothing about the user is stored here; the app saves the
 * wish list itself after the traveler confirms.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { isPaidTier } from './flightPolling';
import { generateJson } from './agentModel';
import {
  PLACES_SCHEMA, PLACES_SYSTEM, cleanPlaces, isShortTikTok, monthKey, parsePlacesAnswer, pickByName, placesPrompt,
  chooseVideoId, oembedTarget, parseEmbedPage, postMeta, shouldCachePost, tiktokVideoId, wishQuota, type PlaceKind, type PlacesAnswer, type QuotaDoc,
} from './socialPost';

const db = () => admin.firestore();
const CACHE_MS = 30 * 86_400_000;

interface OutPlace { id: string; name: string; kind: PlaceKind; city: string | null; countryCode: string | null; lat: number | null; lng: number | null }
interface Cached { caption: string; author: string; authorHandle: string; city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: OutPlace[]; at: number }

async function getJson(url: string, ms = 5000): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  return { status: r.status, body: r.ok ? await r.json() : null };
}

/** TikTok's public embed page for the post, parsed; null on any failure (it's only a fallback). */
export async function embedMeta(videoId: string) {
  try {
    const r = await fetch(`https://www.tiktok.com/embed/v2/${videoId}`, { signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0' } });
    return r.ok ? parseEmbedPage(await r.text()) : null;
  } catch {
    return null;
  }
}

type Feature = { name: string; lat: number; lng: number; countryCode: string | null };
async function geocode(q: string, opts: { types?: string; proximity?: { lat: number; lng: number } | null; limit: number }): Promise<Feature[]> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return [];
  const params = new URLSearchParams({ q, limit: String(opts.limit), access_token: token });
  if (opts.types) params.set('types', opts.types);
  if (opts.proximity) params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`);
  try {
    const { body } = await getJson(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
    const features = (body as { features?: { properties?: { name?: string; context?: { country?: { country_code?: string } } }; geometry?: { coordinates?: [number, number] } }[] } | null)?.features ?? [];
    return features
      .filter((f) => Array.isArray(f.geometry?.coordinates))
      .map((f) => ({
        name: f.properties?.name ?? '', lng: f.geometry!.coordinates![0], lat: f.geometry!.coordinates![1],
        countryCode: f.properties?.context?.country?.country_code?.toUpperCase() ?? null,
      }));
  } catch {
    return [];
  }
}

/** Each place in its own city (a Tokyo video can name a Kyoto bar); city centres looked up once each. */
async function placeAll(a: PlacesAnswer): Promise<{ cityLat: number | null; cityLng: number | null; countryCode: string | null; places: OutPlace[] }> {
  const centres = new Map<string, Feature | null>();
  const centre = async (city: string | null) => {
    if (!city) return null;
    const key = `${city}|${a.country ?? ''}`;
    if (!centres.has(key)) centres.set(key, (await geocode([city, a.country].filter(Boolean).join(', '), { types: 'place', limit: 1 }))[0] ?? null);
    return centres.get(key) ?? null;
  };
  const main = await centre(a.city);
  const places: OutPlace[] = [];
  for (const [i, p] of a.places.entries()) {
    const c = (await centre(p.city ?? a.city)) ?? main;
    const features = await geocode([p.name, p.city ?? a.city].filter(Boolean).join(', '), { proximity: c, limit: 5 });
    const hit = pickByName(p.name, features, c);
    places.push({
      id: `p${i + 1}`, name: p.name, kind: p.kind, city: p.city ?? a.city,
      countryCode: features[0]?.countryCode ?? c?.countryCode ?? null, lat: hit?.lat ?? null, lng: hit?.lng ?? null,
    });
  }
  return { cityLat: main?.lat ?? null, cityLng: main?.lng ?? null, countryCode: main?.countryCode ?? null, places };
}

export const readSocialPost = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const { url, requestId, hint } = (req.data ?? {}) as { url?: unknown; requestId?: unknown; hint?: unknown };
  if (typeof url !== 'string' || url.length > 500 || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(requestId)) {
    throw new HttpsError('invalid-argument', 'Supernova can save TikTok posts for now');
  }

  // Short links (vm./vt./t/) lead to the real post; only a TikTok video URL counts.
  let canonical = url;
  if (isShortTikTok(url)) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0' } });
      canonical = r.url;
    } catch { /* the phone's resolution below */ }
  }
  // TikTok can send our servers' short-link requests somewhere without a video id (device test 2026-11-09): then the
  // link the phone resolved, or the id from the phone's oEmbed, decides.
  const hintObj = hint && typeof hint === 'object' ? (hint as { resolvedUrl?: unknown; videoId?: unknown }) : null;
  const videoId = chooseVideoId(canonical, hintObj);
  if (!videoId) {
    const where = (() => { try { const u = new URL(canonical); return `${u.hostname}${u.pathname}`.slice(0, 120); } catch { return 'unparseable'; } })();
    console.warn('readSocialPost: no video id', { short: isShortTikTok(url), landed: where, hadHint: !!hintObj });
    throw new HttpsError('invalid-argument', 'Supernova can save TikTok posts for now');
  }
  if (!tiktokVideoId(canonical) && typeof hintObj?.resolvedUrl === 'string' && tiktokVideoId(hintObj.resolvedUrl)) canonical = hintObj.resolvedUrl;

  const userSnap = await db().doc(`users/${uid}`).get();
  if (!hasAiConsent(userSnap.data(), 'agent')) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);
  const paid = isPaidTier(String(userSnap.get('tier') ?? 'free'));

  // The limit, claimed before any cost: a video already counted this month is free.
  const now = Date.now();
  const quotaRef = db().doc(`usage_quotas/${uid}/wishlist/${monthKey(now)}`);
  await db().runTransaction(async (tx) => {
    const q = wishQuota(((await tx.get(quotaRef)).data() ?? {}) as QuotaDoc, videoId, paid, now);
    if (!q.ok) {
      throw new HttpsError('resource-exhausted', q.reason === 'monthly'
        ? 'Free accounts save 20 places a month. Pro saves as many as you like.'
        : "That's a lot of saving. Try again in a few minutes.", { reason: q.reason });
    }
    if (q.counted) tx.set(quotaRef, q.patch, { merge: true });
  });

  const cacheRef = db().doc(`socialPosts/${videoId}`);
  const cached = (await cacheRef.get()).data() as Cached | undefined;

  // oEmbed every time: the cover link expires and is never stored, and a deleted video should say so.
  const oe = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(oembedTarget(canonical))}`).catch(() => ({ status: 0, body: null }));
  if (oe.status === 400 || oe.status === 404) throw new HttpsError('not-found', "That video isn't available. It may be private or deleted.");
  // Photo posts come back from oEmbed with only their id (device test 2026-11-09): then TikTok's embed page. TikTok can
  // also answer servers with nothing (2026-11-08): then the phone's own reading — never cached, so no one can plant places.
  const oeTitle = (oe.body as { title?: unknown } | null)?.title;
  const embed = typeof oeTitle === 'string' && oeTitle.trim() ? null : await embedMeta(videoId);
  const meta = postMeta(oe.status, oe.body, hint && typeof hint === 'object' ? hint : null, embed);
  if (oe.status !== 200 || !meta.caption || embed) console.warn('readSocialPost: oEmbed', { videoId, status: oe.status, embed: embed ? (embed.caption ? 'caption' : 'empty') : 'unused', usedDevice: meta.fromDevice, hasCaption: !!meta.caption });
  const coverUrl = meta.coverUrl;

  if (cached && now - cached.at < CACHE_MS) {
    return { videoId, postUrl: canonical, coverUrl, caption: cached.caption, author: cached.author, authorHandle: cached.authorHandle, city: cached.city, country: cached.country, cityLat: cached.cityLat, cityLng: cached.cityLng, places: cached.places };
  }

  const { caption, author, authorHandle } = meta;
  let answer: PlacesAnswer = { city: null, country: null, places: [] };
  let aiFailed = false;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && caption) {
    try {
      const result = await generateJson({
        system: PLACES_SYSTEM, turns: [{ role: 'user', text: placesPrompt(caption, authorHandle) }], schema: PLACES_SCHEMA, apiKey, thinkingBudget: 0,
        parse: parsePlacesAnswer,
      });
      answer = cleanPlaces(result.json);
      console.log('readSocialPost', { uid, videoId, places: answer.places.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs });
    } catch (err) {
      console.warn('readSocialPost: AI failed', { videoId, err: String(err).slice(0, 160) });
      aiFailed = true;
    }
  }
  const placed = await placeAll(answer);
  const out: Cached = { caption, author, authorHandle, city: answer.city, country: answer.country, cityLat: placed.cityLat, cityLng: placed.cityLng, places: placed.places, at: now };
  if (shouldCachePost({ oembedStatus: oe.status, aiFailed: aiFailed || (!apiKey && !!caption), fromDevice: meta.fromDevice, hasCaption: !!caption })) await cacheRef.set(out).catch(() => {});
  return { videoId, postUrl: canonical, coverUrl, caption, author, authorHandle, city: answer.city, country: answer.country, cityLat: placed.cityLat, cityLng: placed.cityLng, places: placed.places };
});
