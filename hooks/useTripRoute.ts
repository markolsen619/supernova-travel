import { useCallback } from 'react';
import { collection, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Destination, TripWithDays } from '@/types';
import { resolveDayDestinationIndices } from '@/utils/dayDestination';
import { endDateFor, planRoute, routeLayout, rowsToEntries, type RouteEntry, type RoutePlan, type RouteDay, type RouteRow } from '@/utils/tripRoute';
import { toCalendarDate, parseCalendarDate } from '@/utils/calendarDate';

/** A route the editor is about to save: the cities in their new order, each with where it came from. */
export interface RouteDraft {
  cities: (Destination & { nights: number })[];
  entries: RouteEntry[];
}

/**
 * The route as a save would lay it out: nights per city and each day's city, in day order
 * (utils/tripRoute routeLayout — a trip whose days all sit in the first city is split by position).
 */
export function tripLayout(trip: TripWithDays): { nights: number[]; dayCities: number[] } {
  const sorted = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const cities = [trip.destination, ...trip.additionalDestinations];
  return routeLayout({
    nights: cities.map((c) => c.nights),
    dayCities: resolveDayDestinationIndices(sorted, cities.map((c) => c.name)),
    start: trip.startDate ? toCalendarDate(trip.startDate.toDate()) : null,
    end: trip.endDate ? toCalendarDate(trip.endDate.toDate()) : null,
  });
}

/** The trip's days as the route math sees them. */
export function routeDays(trip: TripWithDays): RouteDay[] {
  const sorted = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const { dayCities } = tripLayout(trip);
  return sorted.map((d, i) => ({
    id: d.id, dayNumber: d.dayNumber, city: dayCities[i] ?? 0, stops: d.activities.length, stored: d.destinationIndex ?? null,
  }));
}

export function previewRoute(trip: TripWithDays, draft: RouteDraft): RoutePlan {
  return planRoute(routeDays(trip), draft.entries);
}

/**
 * Saves a route change in one batch (docs/superpowers/specs/2026-10-09-city-route-design.md):
 * the trip's city order, nights and end date, and every day renumbered into its
 * city — created, moved or deleted (with its stops). The caller has already
 * confirmed any deleted day that held stops (RoutePlan.dropsWithStops).
 */
export function useTripRoute() {
  const queryClient = useQueryClient();

  /** `alsoDelete`: a day removed on purpose (deleting one day in a city) — `trip` is passed without it. */
  const saveRoute = useCallback(async (trip: TripWithDays, draft: RouteDraft, alsoDelete: TripWithDays['days'] = []) => {
    const plan = previewRoute(trip, draft);
    const [first, ...rest] = draft.cities;
    const totalNights = draft.cities.reduce((s, c) => s + c.nights, 0);
    const start = trip.startDate ? toCalendarDate(trip.startDate.toDate()) : null;
    const end = start ? parseCalendarDate(endDateFor(start, totalNights)) : null;

    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    ops.push((b) => b.update(doc(db, 'trips', trip.id), {
      destination: first,
      additionalDestinations: rest,
      ...(end ? { endDate: Timestamp.fromDate(end) } : {}),
      updatedAt: Timestamp.now(),
    }));
    for (const u of plan.updates) {
      ops.push((b) => b.update(doc(db, 'trips', trip.id, 'days', u.id), { dayNumber: u.dayNumber, destinationIndex: u.city }));
    }
    for (const c of plan.creates) {
      const ref = doc(collection(db, 'trips', trip.id, 'days'));
      ops.push((b) => b.set(ref, { dayNumber: c.dayNumber, destinationIndex: c.city, date: null, title: '', notes: '' }));
    }
    for (const gone of alsoDelete) {
      for (const a of gone.activities) ops.push((b) => b.delete(doc(db, 'trips', trip.id, 'days', gone.id, 'activities', a.id)));
      ops.push((b) => b.delete(doc(db, 'trips', trip.id, 'days', gone.id)));
    }
    for (const id of plan.deletes) {
      const day = trip.days.find((d) => d.id === id);
      for (const a of day?.activities ?? []) ops.push((b) => b.delete(doc(db, 'trips', trip.id, 'days', id, 'activities', a.id)));
      ops.push((b) => b.delete(doc(db, 'trips', trip.id, 'days', id)));
    }

    // One batch holds 500 writes; a route that big (a very long trip losing many full days) goes in chunks,
    // trip doc and day moves first so a failure part-way leaves extra days, never lost ones.
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      ops.slice(i, i + 450).forEach((op) => op(batch));
      await batch.commit();
    }
    await queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    await queryClient.invalidateQueries({ queryKey: ['trips'] });
    await queryClient.invalidateQueries({ queryKey: ['myTrips'] });
  }, [queryClient]);

  /** Edit trip → "Clear all times": every stop loses its time; the order stays (AI trips made before 1.0.4 came with times). */
  const clearStopTimes = useCallback(async (trip: TripWithDays) => {
    const timed = trip.days.flatMap((d) => d.activities.filter((a) => a.startTime || a.endTime).map((a) => ({ day: d.id, id: a.id })));
    for (let i = 0; i < timed.length; i += 450) {
      const batch = writeBatch(db);
      timed.slice(i, i + 450).forEach((t) => batch.update(doc(db, 'trips', trip.id, 'days', t.day, 'activities', t.id), { startTime: null, endTime: null }));
      await batch.commit();
    }
    await queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    return timed.length;
  }, [queryClient]);

  return { saveRoute, clearStopTimes };
}

/** The trip's current route as editor rows (nights saved, else derived — utils/tripRoute routeNights). */
export function routeRowsFromTrip(trip: TripWithDays): RouteRow<Destination>[] {
  const cities = [trip.destination, ...trip.additionalDestinations];
  const { nights } = tripLayout(trip);
  return cities.map((place, i) => ({ key: `${i}-${place.name}`, from: i, nights: nights[i], absorbs: [], absorbsAfter: [], place }));
}

export function draftFromRows(rows: RouteRow<Destination>[]): RouteDraft {
  return {
    cities: rows.map((r) => ({ ...r.place, nights: r.nights })),
    entries: rowsToEntries(rows),
  };
}
