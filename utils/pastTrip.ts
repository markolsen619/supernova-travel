/**
 * A past trip from its photos (spec 2026-10-25-past-trips-from-photos): days are printed dates, stops break at
 * > 250 m or > 90 min, cities at > 50 km. Pure — the review screen edits the draft (utils/pastTripEdits) and
 * services/pastTrip saves it.
 */
import type { PhotoMeta } from '@/utils/photoMeta';
import { haversineMeters } from '@/utils/tripRoutes';

export interface PickedPhoto { id: string; uri: string; meta: PhotoMeta }
export interface DraftStop {
  id: string; lat: number; lng: number; time: string; photoIds: string[]; shownIds: string[];
  name: string; placeName: string | null; type: 'activity' | 'restaurant' | 'hotel';
  /** Built from times alone (no photo had a location): sits at its day's city centre until someone names the place. */
  needsPlace?: boolean;
}
export interface DraftDay { day: string; city: number; caption: string; stops: DraftStop[] }
export interface DraftCity { lat: number; lng: number; name: string; countryCode: string | null }
export interface PastTripDraft {
  title: string; description: string; days: DraftDay[]; cities: DraftCity[];
  unplaced: string[]; coverId: string | null; photos: Record<string, PickedPhoto>;
  /** The traveler chose the cities ("Where was this trip?"): review lets them set each day's. */
  citiesChosen?: boolean;
}

export const STOP_GAP_M = 250;
export const STOP_GAP_MIN = 90;
export const CITY_GAP_M = 50_000;
export const MAX_STOP_PHOTOS = 10;
export const MAX_PICK = 100;
export const MAX_SPAN_DAYS = 60;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function unique(photos: PickedPhoto[]): PickedPhoto[] {
  const seen = new Set<string>();
  return photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

export function spanDays(photos: PickedPhoto[]): number {
  const days = photos.map((p) => p.meta.day).filter((d): d is string => !!d).sort();
  return days.length ? daysBetween(days[0], days[days.length - 1]) + 1 : 0;
}

/** Up to `max` photos of a stop, spread evenly across the visit (first and last kept). */
export function shownPhotos(ids: string[], photos: Record<string, PickedPhoto>, max = MAX_STOP_PHOTOS): string[] {
  if (ids.length <= max) return [...ids];
  const sorted = [...ids].sort((a, b) => (photos[a]?.meta.minutes ?? 0) - (photos[b]?.meta.minutes ?? 0));
  return Array.from({ length: max }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]);
}

export function coverPhoto(days: DraftDay[]): string | null {
  let best: DraftStop | null = null;
  for (const d of days) for (const s of d.stops) if (!best || s.photoIds.length > best.photoIds.length) best = s;
  return best?.shownIds[0] ?? best?.photoIds[0] ?? null;
}

/** Nights per city from each day's city: the last city's last day is the departure day (utils/tripRoute cityRanges). */
export function pastTripNights(dayCities: number[], cityCount: number): number[] {
  return Array.from({ length: cityCount }, (_, i) => {
    const c = dayCities.filter((x) => x === i).length;
    return i === cityCount - 1 ? Math.max(0, c - 1) : c;
  });
}

export function buildPastTrip(input: PickedPhoto[]): PastTripDraft {
  const photos = unique(input);
  const byId: Record<string, PickedPhoto> = Object.fromEntries(photos.map((p) => [p.id, p]));
  const timed = (p: PickedPhoto) => !!p.meta.day && p.meta.minutes !== null;
  const located = photos.filter((p) => timed(p) && p.meta.lat !== null && p.meta.lng !== null);
  // Android's photo picker removes every photo's location (owner 2026-11-02, option a): when none has one, stops
  // come from times alone and wait for the traveler to name each place. A trip with any located photo is unchanged.
  const timeOnly = located.length === 0;
  const placed = (timeOnly ? photos.filter(timed) : located)
    .sort((a, b) => a.meta.day!.localeCompare(b.meta.day!) || a.meta.minutes! - b.meta.minutes!);
  const unplaced = photos.filter((p) => !placed.includes(p)).map((p) => p.id);
  const dated = photos.map((p) => p.meta.day).filter((d): d is string => !!d).sort();
  if (!dated.length) return { title: '', description: '', days: [], cities: [], unplaced, coverId: null, photos: byId };

  const cities: DraftCity[] = [];
  const stopsByDay = new Map<string, DraftStop[]>();
  let current: { stop: DraftStop; day: string; lastMin: number; n: number } | null = null;
  let stopCount = 0;
  for (const ph of placed) {
    const at = timeOnly ? { lat: 0, lng: 0 } : { lat: ph.meta.lat!, lng: ph.meta.lng! };
    const sameStop = current && current.day === ph.meta.day
      && ph.meta.minutes! - current.lastMin <= STOP_GAP_MIN
      && (timeOnly || haversineMeters({ lat: current.stop.lat, lng: current.stop.lng }, at) <= STOP_GAP_M);
    if (current && sameStop) {
      const k = current.n + 1;
      current.stop.lat += (at.lat - current.stop.lat) / k;
      current.stop.lng += (at.lng - current.stop.lng) / k;
      current.stop.photoIds.push(ph.id);
      current.lastMin = ph.meta.minutes!;
      current.n = k;
      continue;
    }
    const stop: DraftStop = { id: `s${++stopCount}`, lat: at.lat, lng: at.lng, time: hhmm(ph.meta.minutes!), photoIds: [ph.id], shownIds: [], name: '', placeName: null, type: 'activity', ...(timeOnly ? { needsPlace: true } : {}) };
    current = { stop, day: ph.meta.day!, lastMin: ph.meta.minutes!, n: 1 };
    const list = stopsByDay.get(ph.meta.day!) ?? [];
    list.push(stop);
    stopsByDay.set(ph.meta.day!, list);
  }

  const first = dated[0];
  const count = daysBetween(first, dated[dated.length - 1]) + 1;
  const days: DraftDay[] = [];
  let city = 0;
  for (let i = 0; i < count; i++) {
    const day = addDays(first, i);
    const stops = stopsByDay.get(day) ?? [];
    stops.forEach((s) => { s.shownIds = shownPhotos(s.photoIds, byId); });
    const lead = timeOnly ? undefined : stops[0];
    if (lead) {
      const here = cities[cities.length - 1];
      if (!here || haversineMeters(here, lead) > CITY_GAP_M) cities.push({ lat: lead.lat, lng: lead.lng, name: '', countryCode: null });
      city = cities.length - 1;
    }
    days.push({ day, city, caption: '', stops });
  }
  return { title: '', description: '', days, cities, unplaced, coverId: coverPhoto(days), photos: byId };
}

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The review screen's eyebrow: `MAY 3 – 7, 2025 · 5 DAYS`. */
export function pastTripEyebrow(days: string[]): string {
  if (!days.length) return '';
  const [y1, m1, d1] = days[0].split('-').map(Number);
  const [y2, m2, d2] = days[days.length - 1].split('-').map(Number);
  const n = days.length === 1 ? '1 DAY' : `${days.length} DAYS`;
  if (days.length === 1) return `${MON[m1 - 1]} ${d1}, ${y1} · ${n}`;
  if (y1 !== y2) return `${MON[m1 - 1]} ${d1}, ${y1} – ${MON[m2 - 1]} ${d2}, ${y2} · ${n}`;
  if (m1 !== m2) return `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y1} · ${n}`;
  return `${MON[m1 - 1]} ${d1} – ${d2}, ${y1} · ${n}`;
}

/**
 * iPhone only for now (final review C2): Android's photo picker hands over photos without their location (and
 * expo-image-picker reads EXIF without MediaStore.setRequireOriginal), so every photo would be unplaced.
 */
export function pastTripsSupported(os: string): boolean {
  return os === 'ios' || os === 'android';
}

/** Stops built from times alone and no cities yet: ask "Where was this trip?" before anything else. */
export const needsCities = (d: PastTripDraft): boolean =>
  d.cities.length === 0 && d.days.some((day) => day.stops.some((s) => s.needsPlace));

/** The cities the traveler chose: every day starts in the first, waiting stops sit at its centre. */
export function withTripCities(d: PastTripDraft, cities: DraftCity[]): PastTripDraft {
  if (!cities.length) return d;
  const c = cities[0];
  return {
    ...d,
    cities,
    citiesChosen: true,
    days: d.days.map((day) => ({ ...day, city: 0, stops: day.stops.map((s) => (s.needsPlace ? { ...s, lat: c.lat, lng: c.lng } : s)) })),
  };
}

/**
 * Back-to-back stops of a day in the same area (same name, same spot) become one, with all their photos (owner
 * trip, 2026-10-26: "Grote Markt, Brussels" twice at one position drew a zero-length leg). Run after naming.
 */
export function mergeSameArea(d: PastTripDraft): PastTripDraft {
  const days = d.days.map((day) => {
    const stops: DraftStop[] = [];
    for (const s of day.stops) {
      const prev = stops[stops.length - 1];
      if (prev && !prev.needsPlace && !s.needsPlace && prev.name === s.name && prev.lat === s.lat && prev.lng === s.lng) {
        const photoIds = [...prev.photoIds, ...s.photoIds];
        stops[stops.length - 1] = { ...prev, photoIds, shownIds: shownPhotos(photoIds, d.photos) };
      } else {
        stops.push(s);
      }
    }
    return { ...day, stops };
  });
  return { ...d, days, coverId: d.coverId };
}
