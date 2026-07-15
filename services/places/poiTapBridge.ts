import type * as GeoJSON from 'geojson';

export interface TappedPoi {
  name: string;
  lat: number;
  lng: number;
  /** Stable key for usePlacesStore cache */
  cacheKey: string;
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function makeCacheKey(name: string, lat: number, lng: number): string {
  return `${name.toLowerCase()}::${roundCoord(lat)}::${roundCoord(lng)}`;
}

/**
 * Extracts a named POI from a queryRenderedFeaturesAtPoint result.
 * The Mapbox Standard style labels POIs with a `name` or `name_en`
 * property in the feature's properties map.
 *
 * Falls back to tapLat/tapLng if the feature geometry isn't a Point.
 */
export function extractPoiFromFeatures(
  collection: GeoJSON.FeatureCollection | undefined,
  tapLat: number,
  tapLng: number,
): TappedPoi | null {
  if (!collection || collection.features.length === 0) return null;

  for (const feature of collection.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const name =
      (props['name_en'] as string | undefined) ??
      (props['name'] as string | undefined) ??
      (props['title'] as string | undefined) ??
      '';
    if (!name) continue;

    let lat = tapLat;
    let lng = tapLng;
    if (feature.geometry?.type === 'Point') {
      const coords = (feature.geometry as GeoJSON.Point).coordinates;
      lng = coords[0];
      lat = coords[1];
    }

    return { name, lat, lng, cacheKey: makeCacheKey(name, lat, lng) };
  }

  return null;
}
