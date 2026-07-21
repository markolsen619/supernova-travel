import { useCallback, useState } from 'react';
import { MapView } from '@rnmapbox/maps';
import type * as GeoJSON from 'geojson';
import { usePlacesStore, type EnrichedPlace } from '@/stores/usePlacesStore';
import { enrichPoiByNameAndCoords } from '@/services/places/googlePlaces';
import { extractPoiFromFeatures } from '@/services/places/poiTapBridge';

// ScreenPointPayload is not re-exported from the @rnmapbox/maps public index
type ScreenPointPayload = { screenPointX: number; screenPointY: number };
// Matches the ref pattern already used at each MapView call site (search.tsx)
type MapViewHandle = InstanceType<typeof MapView>;

/**
 * Shared ambient-Standard-POI → Google Places resolution, cache-first: a
 * reconciliation cache (name+coords → placeId) then a place-detail cache
 * (placeId → EnrichedPlace), and only on a full miss does one billed Text
 * Search fire. This is the exact logic search.tsx's handleMapPress already
 * runs inline — pulled out here so the trip map can reuse it verbatim
 * instead of a second, potentially-drifting copy. search.tsx itself is left
 * untouched (its inline version keeps working exactly as before).
 */
export function usePoiTapResolver() {
  const { getRecon, setRecon, getPlace, setPlace } = usePlacesStore();
  const [enriching, setEnriching] = useState(false);

  const resolvePoiTap = useCallback(
    async (
      mapRef: React.RefObject<MapViewHandle | null>,
      feature: GeoJSON.Feature<GeoJSON.Point, ScreenPointPayload>,
    ): Promise<EnrichedPlace | null> => {
      const { screenPointX, screenPointY } = feature.properties;
      const [tapLng, tapLat] = feature.geometry.coordinates;

      const collection = await mapRef.current?.queryRenderedFeaturesAtPoint([
        screenPointX,
        screenPointY,
      ]);
      const poi = extractPoiFromFeatures(collection, tapLat, tapLng);
      if (!poi) return null;

      // 1. Reconciliation cache: do we already know the placeId for this POI?
      const cachedId = getRecon(poi.cacheKey);
      if (cachedId) {
        const cached = getPlace(cachedId);
        if (cached?.tier === 'tier2') return cached;
      }

      // 2. Cache miss (or only tier1) → Text Search (Tier 2 field mask)
      setEnriching(true);
      try {
        const enriched = await enrichPoiByNameAndCoords(poi.name, poi.lat, poi.lng);
        if (!enriched) return null;
        setRecon(poi.cacheKey, enriched.placeId);
        setPlace(enriched);
        return enriched;
      } finally {
        setEnriching(false);
      }
    },
    [getRecon, getPlace, setRecon, setPlace],
  );

  return { enriching, resolvePoiTap };
}
