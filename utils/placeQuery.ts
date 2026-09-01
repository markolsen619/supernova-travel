/** A soft geographic hint for Google Text Search. Google treats this as a
 *  ranking preference, not a restriction — results outside it are still
 *  possible, which is why it is the fallback provider rather than the first. */
export interface PlaceBias {
  lat: number;
  lng: number;
  /** Metres. Google's maximum is 50000; larger values are clamped. */
  radiusM?: number;
}

const DEFAULT_RADIUS_M = 50000;
const MAX_RADIUS_M = 50000;

/** Builds the `places:searchText` request body. Pure so the bias logic —
 *  the part that was missing and caused La Paz BCS trips to resolve stops in
 *  La Paz, Bolivia — is testable without a network call. */
export function buildTextSearchBody(
  query: string,
  bias?: PlaceBias | null,
  maxResults = 1,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: maxResults,
    languageCode: 'en',
  };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: Math.min(MAX_RADIUS_M, Math.max(1, bias.radiusM ?? DEFAULT_RADIUS_M)),
      },
    };
  }
  return body;
}
