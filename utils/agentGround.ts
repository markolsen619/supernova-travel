/**
 * A place Nova proposes is shown only if grounding finds it in the trip's area
 * (spec §3): the Pennant Bar Nova added landed in another town because the
 * background pass accepted Google's far-away answer after the fact.
 */
import { groundStop, type GroundingProviders } from '@/services/places/groundStop';
import { groundingContextFor } from '@/utils/groundingContext';
import { typedStopMatches } from '@/utils/groundingQueue';
import { haversineMeters } from '@/utils/tripRoutes';
import type { GroundedPlace } from '@/utils/mapboxQuery';
import type { Destination } from '@/types';

export type NovaGround = { status: 'found'; place: GroundedPlace } | { status: 'notFound' };
export const NOVA_MAX_KM = 25;

export function acceptNovaPlace(query: string, place: GroundedPlace | null, center: { lat: number; lng: number } | null, maxKm = NOVA_MAX_KM): NovaGround {
  if (!place) return { status: 'notFound' };
  const main = query.includes(',') ? query.slice(0, query.lastIndexOf(',')) : query;
  if (!typedStopMatches(main, place.name)) return { status: 'notFound' };
  if (center && haversineMeters(center, place) / 1000 > maxKm) return { status: 'notFound' };
  return { status: 'found', place };
}

export async function groundNovaPlace(query: string, dest: Destination, providers?: GroundingProviders): Promise<NovaGround> {
  const ctx = groundingContextFor(dest);
  const center = dest.lat != null && dest.lng != null ? { lat: dest.lat, lng: dest.lng } : ctx.center;
  const place = await groundStop(query, ctx, providers);
  return acceptNovaPlace(query, place, center);
}
