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

  if (isBboxUsable(ctx.bbox)) {
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
    placeId: g.placeId,
    mapboxId: null,
  };
}
