import { useCallback, useRef } from 'react';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { usePlacesStore } from '@/stores/usePlacesStore';
import { enrichPlaceById, enrichPlaceByQuery, photoUrl } from '@/services/places/googlePlaces';
import { resolveCityBounds } from '@/services/places/mapboxSearch';
import type { Trip } from '@/types';

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
 * Alongside the cover backfill, this also backfills `destination.bounds` —
 * the box a later grounding pass uses to constrain stop search to the right
 * city. It is deliberately NOT gated behind the cover's `coverImageUrl !==
 * null` early return: a trip that already has a cover (set manually, or
 * resolved before this field existed) would otherwise never get bounds,
 * which would silently fall back to unbiased global search for every
 * pre-existing trip. Bounds resolution has its own once-per-trip guard
 * (`attemptedBounds`, mirroring `attempted`) because the two concerns
 * succeed and fail independently — a photo miss shouldn't block a bounds
 * hit, and vice versa. Both remain owner-gated.
 */
export function useTripCoverResolver() {
  const { updateTrip } = useCreateTrip();
  const { getPlace, setPlace } = usePlacesStore();
  const attempted = useRef<Set<string>>(new Set());
  const attemptedBounds = useRef<Set<string>>(new Set());

  const resolveBounds = useCallback(
    async (trip: Trip) => {
      if (trip.destination.bounds) return;
      if (attemptedBounds.current.has(trip.id)) return;
      attemptedBounds.current.add(trip.id);

      try {
        const bounds = await resolveCityBounds(trip.destination.name, trip.destination.countryCode);
        if (bounds) {
          await updateTrip(trip.id, {
            destination: { ...trip.destination, bounds },
          });
        } else {
          attemptedBounds.current.delete(trip.id);
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
