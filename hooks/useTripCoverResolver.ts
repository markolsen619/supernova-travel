import { useCallback, useRef } from 'react';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { usePlacesStore } from '@/stores/usePlacesStore';
import { enrichPlaceById, enrichPlaceByQuery, photoUrl } from '@/services/places/googlePlaces';
import { resolveCityBounds } from '@/services/places/mapboxSearch';
import type { Destination, Trip } from '@/types';

/**
 * Backfills a trip's cover photo from Google Places — owner-only, silent,
 * and resolved once, ever, per trip: `coverImageUrl !== null` is the
 * "already resolved" sentinel (empty string means "resolved, no photo
 * found"), written back via updateTrip so every future load of this trip is
 * free, for anyone.
 *
 * AI-generated trips carry only a destination NAME (Gemini never grounds it
 * to a real place) — that's why covers only ever appeared on manually
 * created trips, whose destination came from Places Autocomplete. This
 * grounds the destination first (same enrichPlaceByQuery text-search already
 * used to lazily ground AI activity stops), persists the resolved
 * placeId/lat/lng/countryCode, then resolves the photo from that place —
 * so AI trips get real covers too, not just manual ones.
 *
 * Alongside the cover backfill, this also backfills `bounds` on EVERY
 * destination the trip has — the primary one and each entry in
 * `additionalDestinations` — since the grounding pass constrains each day's
 * stop search to that day's own city. Resolving only the primary would leave
 * roughly two thirds of a three-city itinerary with a null box, skipping
 * Mapbox and sending every one of those stops to Google (correct, because the
 * picker's lat/lng still supplies a bias, but at several times the cost).
 * It is deliberately NOT gated behind the cover's `coverImageUrl !== null`
 * early return: a trip that already has a cover (set manually, or resolved
 * before this field existed) would otherwise never get bounds, which would
 * silently fall back to unbiased global search for every pre-existing trip.
 * Bounds resolution has its own once-per-trip guard (`attemptedBounds`)
 * because the two concerns succeed and fail independently — a photo miss
 * shouldn't block a bounds hit, and vice versa. Both remain owner-gated.
 */
export function useTripCoverResolver() {
  const { updateTrip } = useCreateTrip();
  const { getPlace, setPlace } = usePlacesStore();
  const attempted = useRef<Set<string>>(new Set());
  const attemptedBounds = useRef<Set<string>>(new Set());

  /**
   * Resolves and persists a Mapbox bounding box for every destination on the
   * trip that lacks one, in a single pass and a single write.
   *
   * On the guard: `attemptedBounds` is added to BEFORE the work and is only
   * ever removed again in the `catch`. That asymmetry is deliberate and must
   * not be "restored to parity" with anything.
   *
   *   - A clean `null` from resolveCityBounds means Mapbox simply does not
   *     know this city. Retrying cannot change that, so the guard is kept and
   *     the destination is never looked up again this mount.
   *   - A THROW means something transient went wrong (here, in practice, the
   *     Firestore write — resolveCityBounds swallows its own network errors),
   *     so the guard is released for one more attempt.
   *
   * Releasing the guard on a clean miss looks harmless and is not: every
   * function `useCreateTrip()` returns is a fresh declaration on each render,
   * so `updateTrip` → `resolveBounds` → `resolveCover` all change identity
   * every render, and both consumers re-run their effect every render. With
   * the guard released on a miss, a city Mapbox cannot resolve issues one
   * Mapbox request per render — and the background grounding pass alone
   * causes ~25 re-renders per trip open. The set is the only thing standing
   * between a miss and an unbounded request loop.
   */
  const resolveBounds = useCallback(
    async (trip: Trip) => {
      if (attemptedBounds.current.has(trip.id)) return;
      const all: Destination[] = [trip.destination, ...trip.additionalDestinations];
      if (all.every((d) => d.bounds)) return;
      attemptedBounds.current.add(trip.id);

      try {
        const resolved = await Promise.all(
          all.map(async (dest) => {
            if (dest.bounds) return dest;
            const bounds = await resolveCityBounds(dest.name, dest.countryCode);
            return bounds ? { ...dest, bounds } : dest;
          }),
        );
        if (resolved.some((d, i) => d !== all[i])) {
          const [primary, ...rest] = resolved;
          await updateTrip(trip.id, {
            destination: primary,
            additionalDestinations: rest,
          });
        }
      } catch (err) {
        console.error('[useTripCoverResolver] bounds resolution failed:', err);
        attemptedBounds.current.delete(trip.id);
      }
    },
    [updateTrip],
  );

  const resolveCover = useCallback(
    async (trip: Trip, isOwner: boolean) => {
      if (!isOwner) return;

      await resolveBounds(trip);

      if (trip.coverImageUrl !== null) return;
      if (attempted.current.has(trip.id)) return;
      attempted.current.add(trip.id);

      try {
        let placeId = trip.destination.placeId;

        if (!placeId) {
          const resolved = await enrichPlaceByQuery(trip.destination.name);
          if (!resolved) {
            attempted.current.delete(trip.id);
            return;
          }
          placeId = resolved.placeId;
          setPlace(resolved);
          await updateTrip(trip.id, {
            destination: {
              ...trip.destination,
              placeId,
              lat: resolved.lat,
              lng: resolved.lng,
              countryCode: resolved.countryCode,
            },
          });
        }

        const cached = getPlace(placeId);
        let photoNames = cached?.photoNames;

        if (!photoNames) {
          const enriched = await enrichPlaceById(placeId);
          if (!enriched) {
            attempted.current.delete(trip.id);
            return;
          }
          photoNames = enriched.photoNames;
          setPlace({
            placeId,
            name: trip.destination.name,
            address: '',
            lat: trip.destination.lat ?? 0,
            lng: trip.destination.lng ?? 0,
            countryCode: trip.destination.countryCode,
            tier: 'tier2',
            ...enriched,
          });
        }

        const url = photoNames?.[0] ? photoUrl(photoNames[0], 1200) : '';
        await updateTrip(trip.id, { coverImageUrl: url });
      } catch (err) {
        console.error('[useTripCoverResolver] failed:', err);
        attempted.current.delete(trip.id);
      }
    },
    [updateTrip, getPlace, setPlace, resolveBounds],
  );

  return { resolveCover };
}
