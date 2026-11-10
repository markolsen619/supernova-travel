/**
 * Social wish list — the app's rules (spec docs/superpowers/specs/2026-11-06-social-wishlist-design.md): finding the
 * TikTok link in shared text, matching saved places to trips by distance, grouping by city, and the saved doc. Pure.
 */
import { tripSpan } from '@/utils/homeState';

export type WishKind = 'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other';
export interface WishPlace {
  id: string; name: string; kind: WishKind; city: string | null; countryCode: string | null; lat: number | null; lng: number | null;
  addedTo?: { tripId: string; dayId: string; activityId: string };
}
export interface WishSave {
  videoId: string; platform: 'tiktok'; postUrl: string; author: string; authorHandle: string; caption: string;
  city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; savedAtMs: number; places: WishPlace[];
}
export interface TripForMatch { id: string; title: string; start: string | null; end: string | null; cities: { name: string; lat: number | null; lng: number | null }[] }

const TIKTOK_HOST = /^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/i;

/** The first TikTok link in shared text ("Check this out https://vm.tiktok.com/x/ #tokyo"), else null. */
export function tiktokUrlFromShare(text: string): string | null {
  for (const raw of text.match(/https?:\/\/\S+/g) ?? []) {
    const candidate = raw.replace(/[),.]+$/, '');
    try {
      if (TIKTOK_HOST.test(new URL(candidate).hostname)) return candidate;
    } catch { /* not a URL */ }
  }
  return null;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}

/** Upcoming or current (undated trips count as upcoming). */
const active = (t: TripForMatch, today: string) => !t.end || t.end >= today;

function nearestKm(place: { lat: number | null; lng: number | null }, trip: TripForMatch): number | null {
  if (place.lat == null || place.lng == null) return null;
  const d = trip.cities.filter((c) => c.lat != null && c.lng != null).map((c) => km({ lat: place.lat!, lng: place.lng! }, { lat: c.lat!, lng: c.lng! }));
  return d.length ? Math.min(...d) : null;
}

/** Saved places within `maxKm` of any city of an upcoming or current trip. */
export function wishMatches(trip: TripForMatch, saves: WishSave[], today: string, maxKm = 50): { save: WishSave; place: WishPlace }[] {
  if (!active(trip, today)) return [];
  return saves.flatMap((save) => save.places
    .filter((place) => { const d = nearestKm(place, trip); return d != null && d <= maxKm; })
    .map((place) => ({ save, place })));
}

/**
 * Each trip city's saved places (owner 2026-11-09: the trip's small Wish list chip was missed — they belong under the
 * city you're planning): a place goes to its nearest located city, in the trip's city order; ones already on this trip
 * are left out. Pass `wishMatches` output, so everything is already within reach of the trip.
 */
export function wishByCity(trip: TripForMatch, matches: { save: WishSave; place: WishPlace }[]): { save: WishSave; place: WishPlace }[][] {
  const out: { save: WishSave; place: WishPlace }[][] = trip.cities.map(() => []);
  for (const m of matches) {
    if (m.place.addedTo?.tripId === trip.id || m.place.lat == null || m.place.lng == null) continue;
    let best = -1, bestKm = Infinity;
    trip.cities.forEach((c, i) => {
      if (c.lat == null || c.lng == null) return;
      const d = km({ lat: m.place.lat!, lng: m.place.lng! }, { lat: c.lat, lng: c.lng });
      if (d < bestKm) { bestKm = d; best = i; }
    });
    if (best >= 0) out[best].push(m);
  }
  return out;
}

/** The cities a post touches: its own city and its places' cities, each once. */
function postCities(save: WishSave): string[] {
  return [...new Set([save.city, ...save.places.map((p) => p.city)].filter((c): c is string => !!c && !!c.trim()))];
}

/** The grid's city chips (spec 2026-11-10 §1): each post counted once per city it touches, most saved first, then A–Z. */
export function wishCityChips(saves: WishSave[]): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of saves) for (const c of postCities(s)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** Posts that touch `city`; `null` = All. */
export const savesInCity = (saves: WishSave[], city: string | null) => (city ? saves.filter((s) => postCities(s).includes(city)) : saves);

/** `BUDAPEST · 1 PLACE` above a grid card; `TIKTOK` when the post has no city. */
export function wishCardEyebrow(save: WishSave): string {
  const city = save.city ?? save.places.find((p) => p.city)?.city ?? null;
  if (!city) return 'TIKTOK';
  const n = save.places.length;
  return `${city.toUpperCase()} · ${n} ${n === 1 ? 'PLACE' : 'PLACES'}`;
}

/** The upcoming trip whose nearest city is closest to the place, within `maxKm` ("Fits your Tokyo trip"). */
export function fitsTrip(place: Pick<WishPlace, 'lat' | 'lng'>, trips: TripForMatch[], today: string, maxKm = 50): TripForMatch | null {
  let best: { t: TripForMatch; d: number } | null = null;
  for (const t of trips) {
    if (!active(t, today)) continue;
    const d = nearestKm(place, t);
    if (d != null && d <= maxKm && (!best || d < best.d)) best = { t, d };
  }
  return best?.t ?? null;
}

export function kindToActivityType(kind: WishKind): 'restaurant' | 'hotel' | 'activity' {
  if (kind === 'restaurant' || kind === 'bar' || kind === 'cafe') return 'restaurant';
  return kind === 'hotel' ? 'hotel' : 'activity';
}

/** Places grouped by their city (else the post's city, else Somewhere); groups by their newest save first. */
export function wishlistByCity(saves: WishSave[]): { city: string; places: { save: WishSave; place: WishPlace | null }[] }[] {
  const groups = new Map<string, { newest: number; places: { save: WishSave; place: WishPlace | null }[] }>();
  const add = (city: string, save: WishSave, place: WishPlace | null) => {
    const g = groups.get(city) ?? { newest: 0, places: [] };
    g.newest = Math.max(g.newest, save.savedAtMs);
    g.places.push({ save, place });
    groups.set(city, g);
  };
  for (const save of [...saves].sort((a, b) => b.savedAtMs - a.savedAtMs)) {
    if (!save.places.length) add(save.city ?? 'Somewhere', save, null);
    for (const place of save.places) add(place.city ?? save.city ?? 'Somewhere', save, place);
  }
  return [...groups.entries()].sort((a, b) => b[1].newest - a[1].newest).map(([city, g]) => ({ city, places: g.places }));
}

/** The wish-list doc from the sheet: the ticked places plus ones added by name, at most 10. */
export function wishlistDoc(preview: WishSave, keepIds: string[], extra: WishPlace[]): Omit<WishSave, 'savedAtMs'> {
  const { savedAtMs: _savedAtMs, ...rest } = preview;
  return { ...rest, places: [...preview.places.filter((p) => keepIds.includes(p.id)), ...extra].slice(0, 10) };
}

/** A trip as matching needs it: calendar start/end (Home's `tripSpan`) and every city's position. */
export function toTripForMatch(t: {
  id: string; title: string; startDay?: string | null; startDate?: { toDate(): Date } | null; endDate?: { toDate(): Date } | null;
  destination: { name: string; lat: number | null; lng: number | null }; additionalDestinations?: { name: string; lat: number | null; lng: number | null }[];
}): TripForMatch {
  const { start, end } = tripSpan(t);
  return {
    id: t.id, title: t.title, start, end,
    cities: [t.destination, ...(t.additionalDestinations ?? [])].map((c) => ({ name: c.name, lat: c.lat ?? null, lng: c.lng ?? null })),
  };
}

/**
 * A saved place as a trip stop (without createdAt — the caller adds its timestamp): the type from its kind, the
 * place's own position, and "name, city" so the background grounding pass can place it better. No undefined values.
 */
export function wishActivity(place: WishPlace, save: Pick<WishSave, 'city'>) {
  const city = place.city ?? save.city;
  return {
    type: kindToActivityType(place.kind), title: place.name, titleSource: 'user' as const, placeId: null, placeName: place.name,
    address: null, lat: place.lat, lng: place.lng, searchQuery: city ? `${place.name}, ${city}` : place.name,
    startTime: null, endTime: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null,
    mediaUrls: [] as string[], visited: false, visitedAt: null, groundingFailedAt: null,
  };
}

/**
 * After the limit paywall closes: retry only once the account is paid (final review — `useLimitPaywall` calls back on a
 * cancel too, and the retry hit the limit again and reopened the paywall forever).
 */
export const afterLimitPaywall = (tier: string | null): 'retry' | 'stop' => (tier === 'pro' || tier === 'business' ? 'retry' : 'stop');

/** Saving a video already on the list keeps each place's "on a trip" mark (final review: a re-share wiped them). */
export function mergeReshare<T extends Pick<WishSave, 'places'>>(existing: Pick<WishSave, 'places'> | null, incoming: T): T {
  if (!existing) return incoming;
  const fold = (s: string) => s.trim().toLowerCase();
  const marks = new Map(existing.places.filter((p) => p.addedTo).map((p) => [fold(p.name), p.addedTo!]));
  return { ...incoming, places: incoming.places.map((p) => (marks.has(fold(p.name)) ? { ...p, addedTo: marks.get(fold(p.name))! } : p)) };
}

/** A call made while the previous one is still running is ignored (final review: a double tap added two stops). */
export function singleFlight<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let running: Promise<void> | null = null;
  return (...args: A) => {
    if (running) return running;
    running = fn(...args).finally(() => { running = null; });
    return running;
  };
}

/** TikTok's public oEmbed answer, read on the phone (the server's lookup can come back empty — device test 2026-11-08). */
export function parseOembed(json: unknown): { caption: string; author: string; authorHandle: string; coverUrl: string | null; videoId: string | null } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { title?: unknown; author_name?: unknown; author_unique_id?: unknown; thumbnail_url?: unknown; embed_product_id?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cover = str(j.thumbnail_url);
  const id = str(j.embed_product_id);
  return {
    caption: str(j.title), author: str(j.author_name), authorHandle: str(j.author_unique_id),
    coverUrl: cover.startsWith('https://') ? cover : null, videoId: /^\d{8,25}$/.test(id) ? id : null,
  };
}

/** A TikTok post's id from a full /video/ or /photo/ link (photo posts are slideshows, device test 2026-11-09). */
export function tiktokPostId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!TIKTOK_HOST.test(u.hostname)) return null;
    return /\/(?:video|photo)\/(\d{8,25})/.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** oEmbed refuses /photo/ links (400) but answers the same post written as /video/. */
export const oembedLink = (url: string) => url.replace(/\/photo\/(\d{8,25})/, '/video/$1');

/**
 * Caption, creator and cover from TikTok's public embed page (`/embed/v2/{id}`), shaped like `parseOembed` — for photo
 * posts oEmbed gives only the id. Mirrors functions/src/socialPost.ts `parseEmbedPage` (separate TypeScript projects).
 */
export function embedMetaFromHtml(html: string, videoId: string): NonNullable<ReturnType<typeof parseOembed>> | null {
  const m = /<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let state: unknown;
  try { state = JSON.parse(m[1]); } catch { return null; }
  const data = (state as { source?: { data?: Record<string, { videoData?: unknown }> } })?.source?.data ?? {};
  const entry = Object.entries(data).find(([k, v]) => k.startsWith('/embed/v2/') && !!v?.videoData);
  if (!entry) return null;
  const vd = entry[1].videoData as { itemInfos?: { text?: unknown; covers?: unknown }; authorInfos?: { uniqueId?: unknown; nickName?: unknown } };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cover = Array.isArray(vd.itemInfos?.covers) ? str(vd.itemInfos!.covers[0]) : '';
  return {
    caption: str(vd.itemInfos?.text), author: str(vd.authorInfos?.nickName), authorHandle: str(vd.authorInfos?.uniqueId),
    coverUrl: /^https:\/\/\S+$/.test(cover) ? cover : null, videoId: /^\d{8,25}$/.test(videoId) ? videoId : null,
  };
}

/** One sheet per share: the same link again within 10 s is the same share (it opened twice — device test). */
export const isDuplicateShare = (last: { url: string; at: number } | null, url: string, nowMs: number) =>
  !!last && last.url === url && nowMs - last.at < 10_000;

/** Saved places within `maxKm` of a city that aren't on a trip yet and have a position (planning a trip there). */
export function savesNear(center: { lat: number; lng: number } | null, saves: WishSave[], maxKm = 50): { save: WishSave; place: WishPlace }[] {
  if (!center) return [];
  return saves.flatMap((save) => save.places
    .filter((p) => !p.addedTo && p.lat != null && p.lng != null && km(center, { lat: p.lat!, lng: p.lng! }) <= maxKm)
    .map((place) => ({ save, place })));
}

/** The must-see text with these names added once each (case-insensitive), comma-separated. */
export function mustSeeWith(input: string, names: string[]): string {
  const have = input.split(',').map((s) => s.trim()).filter(Boolean);
  const lower = new Set(have.map((s) => s.toLowerCase()));
  for (const n of names) if (!lower.has(n.toLowerCase())) { have.push(n); lower.add(n.toLowerCase()); }
  return have.join(', ');
}

/** For Home's nudge: the city with the most saved places not yet on a trip (newest saves first), with its centre. */
export function topSavedCity(saves: WishSave[]): { city: string; country: string | null; lat: number; lng: number; count: number; names: string[] } | null {
  const by = new Map<string, { city: string; country: string | null; lat: number; lng: number; names: string[] }>();
  for (const s of [...saves].sort((a, b) => b.savedAtMs - a.savedAtMs)) {
    for (const p of s.places) {
      if (p.addedTo || p.lat == null || p.lng == null) continue;
      const city = p.city ?? s.city;
      if (!city) continue;
      const g = by.get(city) ?? { city, country: s.country, lat: (p.city && p.city !== s.city) ? p.lat : (s.cityLat ?? p.lat), lng: (p.city && p.city !== s.city) ? p.lng : (s.cityLng ?? p.lng), names: [] };
      g.names.push(p.name);
      by.set(city, g);
    }
  }
  const best = [...by.values()].sort((a, b) => b.names.length - a.names.length)[0];
  return best ? { ...best, count: best.names.length } : null;
}
