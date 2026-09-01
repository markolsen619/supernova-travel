import { searchPlaceInBounds } from '@/services/places/mapboxSearch';
import { enrichPlaceByQuery } from '@/services/places/googlePlaces';
import { isBboxUsable, type Bbox } from '@/utils/geoBounds';
import type { GroundedPlace } from '@/utils/mapboxQuery';
import type { PlaceBias } from '@/utils/placeQuery';

export interface GroundingContext {
  bbox: Bbox | null;
  center: { lat: number; lng: number } | null;
}

export interface GroundingProviders {
  mapbox: (q: string, bbox: Bbox | null, center: { lat: number; lng: number } | null) => Promise<GroundedPlace | null>;
  google: (q: string, bias: PlaceBias | null) => Promise<{
    placeId: string; name: string; address: string; lat: number; lng: number; countryCode: string | null;
  } | null>;
}

const DEFAULT_PROVIDERS: GroundingProviders = {
  mapbox: searchPlaceInBounds,
  google: (q, bias) => enrichPlaceByQuery(q, bias, 'grounding'),
};

/**
 * Grounds one stop: Mapbox inside a hard box first, Google with a soft bias
 * second.
 *
 * The order is not about quality — Google is more accurate — it is about cost
 * and failure shape. Mapbox is free within the box and cannot answer with a
 * far-away wrong place; Google costs per call but resolves what Mapbox cannot
 * see. Roughly 90% of stops never reach the second link.
 */
export async function groundStop(
  query: string,
  ctx: GroundingContext,
  providers: GroundingProviders = DEFAULT_PROVIDERS,
): Promise<GroundedPlace | null> {
  if (!query.trim()) return null;

  const boxed = isBboxUsable(ctx.bbox);

  // No box AND no centre is not a searchable request — it is a caller bug.
  // Passing it through would issue an unbiased, planet-wide Google Text
  // Search, which is precisely the failure this module exists to prevent (a
  // La Paz, Baja California Sur itinerary resolving its stops in La Paz,
  // Bolivia) and it would do so silently, at full price, with a
  // plausible-looking result the caller then persists. Refusing loudly means
  // the stop stays ungrounded and the bug shows up as a log line rather than
  // as wrong coordinates nobody re-checks.
  if (!boxed && ctx.center == null) {
    console.error('[groundStop] refusing to search with no bbox and no center:', query);
    return null;
  }

  if (boxed) {
    const hit = await providers.mapbox(query, ctx.bbox, ctx.center);
    if (hit) return hit;
  }

  const g = await providers.google(query, ctx.center);
  if (!g) return null;

  return {
    name: g.name,
    lat: g.lat,
    lng: g.lng,
    address: g.address || null,
    countryCode: g.countryCode,
    source: 'google',
    // `EnrichedPlace.placeId` is `place.id ?? ''` upstream, so a Google hit
    // that came back without an id yields an empty string. That would be
    // cached under the '' key by applyGroundingResult and written onto the
    // activity as a placeId that identifies nothing — null is the honest
    // value for "no Google identity".
    placeId: g.placeId || null,
    mapboxId: null,
  };
}
