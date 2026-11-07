/**
 * Social wish list — the app's rules (spec docs/superpowers/specs/2026-11-06-social-wishlist-design.md): finding the
 * TikTok link in shared text, matching saved places to trips by distance, grouping by city, and the saved doc. Pure.
 */
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
