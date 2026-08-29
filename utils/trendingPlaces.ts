import type { Trip, Destination } from '@/types';

export interface TrendingPlace {
  /** placeId when present, else rounded coordinates. */
  key: string;
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  placeId: string | null;
  /** How many public trips go here. */
  tripCount: number;
  /** Summed savesCount + likesCount across those trips. */
  weight: number;
}

/** ~110 m. Close enough that two trips to the same city collapse. */
function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Identity for deduping. placeId is preferred, but AI-generated trips can
 * carry a destination name with no placeId until useTripCoverResolver grounds
 * them, so coordinates are the fallback.
 */
function identityFor(d: Destination): string | null {
  if (d.lat === null || d.lng === null) return null;
  if (d.placeId) return `id:${d.placeId}`;
  return `at:${roundCoord(d.lat)},${roundCoord(d.lng)}`;
}

/**
 * Public trip destinations -> ranked map pins.
 *
 * Pure so the dedupe rules, the weighting and the sort stability are testable
 * without Firestore. Sort stability matters more than it looks: an unstable
 * order makes pins visibly reshuffle between renders.
 */
export function aggregateDestinations(trips: Trip[], limit = 50): TrendingPlace[] {
  const byKey = new Map<string, TrendingPlace>();

  for (const trip of trips) {
    const destinations: Destination[] = [
      trip.destination,
      ...(trip.additionalDestinations ?? []),
    ].filter(Boolean);

    const tripWeight = (trip.savesCount ?? 0) + (trip.likesCount ?? 0);

    for (const d of destinations) {
      const key = identityFor(d);
      // No coordinates means it cannot be drawn. Skip rather than guess.
      if (!key) continue;

      const existing = byKey.get(key);
      if (existing) {
        existing.tripCount += 1;
        existing.weight += tripWeight;
        continue;
      }

      byKey.set(key, {
        key,
        name: d.name,
        lat: d.lat as number,
        lng: d.lng as number,
        countryCode: d.countryCode,
        placeId: d.placeId,
        tripCount: 1,
        weight: tripWeight,
      });
    }
  }

  return Array.from(byKey.values())
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.tripCount - a.tripCount ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
