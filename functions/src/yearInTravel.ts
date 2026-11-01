/**
 * Year in Travel (spec 2026-11-01-year-in-travel-design.md): one person's travel year, from their own and joined
 * trips. Pure — yearInTravelFunctions.ts reads the trips. Photos only the person took; companions never blocked.
 */
export interface YTStop { lat: number | null; lng: number | null; type: string; order: number; photoUrls: string[] }
export interface YTDay { dayNumber: number; stops: YTStop[] }
export interface YTTrip { id: string; title: string; authorUid: string; members: string[]; start: Date | null; end: Date | null;
  cities: { name: string; countryCode: string | null; lat: number | null; lng: number | null }[]; travelStyles: string[]; days: YTDay[] }
type Types = 'restaurant' | 'activity' | 'hotel' | 'flight' | 'transport' | 'free';
export interface YearSummary { year: number; trips: number; daysAway: number; cities: number; countries: number; km: number;
  longestTrip: { tripId: string; title: string; days: number } | null; biggestDay: { tripId: string; title: string; dayNumber: number; stops: number } | null;
  typeCounts: Record<Types, number>; topStyle: string | null; places: { name: string; lat: number; lng: number }[]; photos: string[];
  companions: { uid: string; name: string; avatarUrl: string | null }[]; nextTrip: { tripId: string; title: string; startMs: number } | null; computedAtMs: number }

const DAY = 86_400_000;
const utcDay = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());

export function tripDaysInYear(start: Date, end: Date, year: number): number {
  const a = Math.max(utcDay(start), Date.UTC(year, 0, 1));
  const b = Math.min(utcDay(end), Date.UTC(year, 11, 31));
  return b < a ? 0 : Math.round((b - a) / DAY) + 1;
}

const R = 6371;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const earthFraction = (k: number) => k / 40_075;

export function yearSummary(i: { uid: string; year: number; nowMs: number; trips: YTTrip[]; reviewPhotos: string[];
  profiles: Record<string, { name: string; avatarUrl: string | null }>; blocked: Set<string>; upcoming: { tripId: string; title: string; startMs: number }[] }): YearSummary {
  const trips = i.trips.filter((t) => t.start && t.end && tripDaysInYear(t.start, t.end, i.year) > 0);
  const daySet = new Set<number>();
  const cities = new Set<string>(), countries = new Set<string>();
  const typeCounts: Record<Types, number> = { restaurant: 0, activity: 0, hotel: 0, flight: 0, transport: 0, free: 0 };
  const styleCounts = new Map<string, number>();
  const places: { name: string; lat: number; lng: number }[] = [];
  const photos: string[] = [];
  const companionIds: string[] = [];
  let totalKm = 0;
  let longest: YearSummary['longestTrip'] = null;
  let biggest: YearSummary['biggestDay'] = null;
  for (const t of [...trips].sort((a, b) => a.start!.getTime() - b.start!.getTime())) {
    const from = Math.max(utcDay(t.start!), Date.UTC(i.year, 0, 1)), to = Math.min(utcDay(t.end!), Date.UTC(i.year, 11, 31));
    for (let x = from; x <= to; x += DAY) daySet.add(x);
    const days = tripDaysInYear(t.start!, t.end!, i.year);
    if (!longest || days > longest.days) longest = { tripId: t.id, title: t.title, days };
    for (const c of t.cities) {
      cities.add(c.name.trim().toLowerCase());
      if (c.countryCode) countries.add(c.countryCode.toUpperCase());
      if (c.lat != null && c.lng != null) places.push({ name: c.name, lat: c.lat, lng: c.lng });
    }
    for (const s of t.travelStyles) styleCounts.set(s, (styleCounts.get(s) ?? 0) + 1);
    let prev: { lat: number; lng: number } | null = null;
    for (const day of [...t.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
      if (!biggest || day.stops.length > biggest.stops) biggest = { tripId: t.id, title: t.title, dayNumber: day.dayNumber, stops: day.stops.length };
      for (const s of [...day.stops].sort((a, b) => a.order - b.order)) {
        if (s.type in typeCounts) typeCounts[s.type as Types]++;
        if (t.authorUid === i.uid) photos.push(...s.photoUrls);
        if (s.lat == null || s.lng == null) continue;
        const here = { lat: s.lat, lng: s.lng };
        if (prev) totalKm += km(prev, here);
        prev = here;
      }
    }
    for (const m of t.members) if (m !== i.uid && !i.blocked.has(m) && !companionIds.includes(m)) companionIds.push(m);
  }
  photos.push(...i.reviewPhotos);
  let topStyle: string | null = null, best = 0;
  for (const [k, v] of styleCounts) if (v > best) { best = v; topStyle = k; }
  if (!topStyle) {
    if (typeCounts.restaurant > 0 && typeCounts.restaurant >= typeCounts.activity) topStyle = 'foodie';
    else if (typeCounts.activity > 0) topStyle = 'adventure';
  }
  return {
    year: i.year, trips: trips.length, daysAway: daySet.size, cities: cities.size, countries: countries.size, km: Math.round(totalKm),
    longestTrip: longest, biggestDay: biggest && biggest.stops > 0 ? biggest : null, typeCounts, topStyle, places,
    photos: [...new Set(photos)].reverse().slice(0, 6),
    companions: companionIds.filter((u) => i.profiles[u]).slice(0, 8).map((u) => ({ uid: u, name: i.profiles[u].name, avatarUrl: i.profiles[u].avatarUrl })),
    nextTrip: [...i.upcoming].sort((a, b) => a.startMs - b.startMs)[0] ?? null, computedAtMs: i.nowMs,
  };
}
