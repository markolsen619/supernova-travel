/**
 * Smart add (spec 2026-11-10 §2): a saved place goes to the day of its city where it adds the least travel, at its best
 * spot, with one write (a midpoint order). Pure. The same placement Nova uses (utils/routePlacement), so the trip check
 * never asks to move it later.
 */
import { bestInsertion, insertionCostKm, type PlaceStop } from '@/utils/routePlacement';
import { orderAt, tripStart } from '@/utils/agentApply';
import type { TripActivity, TripDay, TripWithDays } from '@/types';

export type SmartPlacement = { dayId: string; dayNumber: number; cityIndex: number; order: number; afterTitle: string | null };
type NewPlace = { lat: number | null; lng: number | null; title: string };

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const asStop = (a: TripActivity): PlaceStop =>
  ({ id: a.id, lat: a.lat ?? null, lng: a.lng ?? null, type: a.type, title: a.title, startTime: a.startTime ?? null, fixed: !!a.startTime || !!a.fromBooking });
const sorted = (day: TripDay) => [...day.activities].sort((a, b) => a.order - b.order);
const located = (day: TripDay) => day.activities.some((a) => a.lat != null && a.lng != null);

/** Where the place goes inside one chosen day (Change day, and smart add's final step). */
export function placementInDay(day: TripDay, place: NewPlace): { order: number; afterTitle: string | null } {
  const list = sorted(day);
  const add: PlaceStop = { id: '__new__', lat: place.lat, lng: place.lng, type: 'activity', title: place.title, startTime: null };
  const idx = list.length ? bestInsertion(list.map(asStop), add) : 0;
  return { order: orderAt(list, idx), afterTitle: idx > 0 ? list[idx - 1].title : null };
}

/**
 * The day and spot for a saved place in city `cityIndex` of this trip, or null (no position, no days in that city, or
 * every one already past) — the caller then shows the day list. `dayCities[i]` is the city of `trip.days[i]`
 * (resolveDayDestinationIndices — older trips' days have no destinationIndex).
 */
export function smartPlacement(trip: TripWithDays, dayCities: number[], cityIndex: number, place: NewPlace, today: string): SmartPlacement | null {
  if (place.lat == null || place.lng == null) return null;
  const start = tripStart(trip);
  const cityDays = trip.days
    .map((d, i) => ({ d, city: dayCities[i] }))
    .filter((x) => x.city === cityIndex)
    .map((x) => x.d)
    .filter((d) => !start || addDays(start, d.dayNumber - 1) >= today)
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (!cityDays.length) return null;

  const add: PlaceStop = { id: '__new__', lat: place.lat, lng: place.lng, type: 'activity', title: place.title, startTime: null };
  let chosen: TripDay;
  if (cityDays.some(located)) {
    // An empty day would cost 0 km and always win; only days with a placed stop compete (review focus 3).
    const scored = cityDays.filter(located).map((d) => {
      const stops = sorted(d).map(asStop);
      return { d, km: insertionCostKm(stops, add, bestInsertion(stops, add)), n: d.activities.length };
    });
    scored.sort((a, b) => a.km - b.km || a.n - b.n || a.d.dayNumber - b.d.dayNumber);
    chosen = scored[0].d;
  } else {
    // All empty: the first day that isn't the city's departure day (its last day, when a later city or the trip's end follows).
    const lastTripDay = Math.max(...trip.days.map((d) => d.dayNumber));
    const laterCity = dayCities.some((c) => c > cityIndex);
    const departure = cityDays[cityDays.length - 1];
    const isDeparture = (d: TripDay) => cityDays.length > 1 && d.id === departure.id && (laterCity || d.dayNumber === lastTripDay);
    chosen = cityDays.find((d) => !isDeparture(d)) ?? cityDays[0];
  }
  const spot = placementInDay(chosen, place);
  return { dayId: chosen.id, dayNumber: chosen.dayNumber, cityIndex, ...spot };
}

/** The banner after a smart add. */
export function smartAddBanner(r: { dayNumber: number; city: string; afterTitle: string | null; multiCity: boolean }): string {
  const where = r.multiCity ? ` · ${r.city}` : '';
  return r.afterTitle ? `Added to Day ${r.dayNumber}${where}, after ${r.afterTitle}` : `Added as the first stop of Day ${r.dayNumber}${where}`;
}
