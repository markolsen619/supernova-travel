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
}
export interface DraftDay { day: string; city: number; caption: string; stops: DraftStop[] }
export interface DraftCity { lat: number; lng: number; name: string; countryCode: string | null }
export interface PastTripDraft {
  title: string; description: string; days: DraftDay[]; cities: DraftCity[];
  unplaced: string[]; coverId: string | null; photos: Record<string, PickedPhoto>;
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
  const placed = photos
    .filter((p) => p.meta.day && p.meta.minutes !== null && p.meta.lat !== null && p.meta.lng !== null)
    .sort((a, b) => a.meta.day!.localeCompare(b.meta.day!) || a.meta.minutes! - b.meta.minutes!);
  const unplaced = photos.filter((p) => !placed.includes(p)).map((p) => p.id);
  const dated = photos.map((p) => p.meta.day).filter((d): d is string => !!d).sort();
  if (!dated.length) return { title: '', description: '', days: [], cities: [], unplaced, coverId: null, photos: byId };

  const cities: DraftCity[] = [];
  const stopsByDay = new Map<string, DraftStop[]>();
  let current: { stop: DraftStop; day: string; lastMin: number; n: number } | null = null;
  let stopCount = 0;
  for (const ph of placed) {
    const at = { lat: ph.meta.lat!, lng: ph.meta.lng! };
    const sameStop = current && current.day === ph.meta.day
      && ph.meta.minutes! - current.lastMin <= STOP_GAP_MIN
      && haversineMeters({ lat: current.stop.lat, lng: current.stop.lng }, at) <= STOP_GAP_M;
    if (current && sameStop) {
      const k = current.n + 1;
      current.stop.lat += (at.lat - current.stop.lat) / k;
      current.stop.lng += (at.lng - current.stop.lng) / k;
      current.stop.photoIds.push(ph.id);
      current.lastMin = ph.meta.minutes!;
      current.n = k;
      continue;
    }
    const stop: DraftStop = { id: `s${++stopCount}`, lat: at.lat, lng: at.lng, time: hhmm(ph.meta.minutes!), photoIds: [ph.id], shownIds: [], name: '', placeName: null, type: 'activity' };
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
    const lead = stops[0];
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
  return os === 'ios';
}
