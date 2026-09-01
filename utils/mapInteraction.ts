/**
 * Pure geometry for map tap handling. Separate from the components so the
 * bbox argument order and the fallback thresholds are testable.
 */

/** Half of the 44 pt accessibility touch target. */
export const TAP_RADIUS_PT = 22;

/** Below this zoom a tap covers too much ground for a nearby lookup to mean anything. */
const NEARBY_MIN_ZOOM = 12;

/**
 * A square hit area around a tap, in the order rnmapbox expects.
 *
 * `queryRenderedFeaturesInRect` takes `[top, left, bottom, right]`, NOT the
 * `[minX, minY, maxX, maxY]` most bbox APIs use. Getting it backwards returns
 * an empty collection with no error — indistinguishable from "no POI here" —
 * so the order is stated once, here, and never inline at a call site.
 */
export function tapBbox(
  x: number,
  y: number,
  radius: number = TAP_RADIUS_PT,
): [number, number, number, number] {
  return [
    Math.max(0, y - radius), // top
    Math.max(0, x - radius), // left
    y + radius,              // bottom
    x + radius,              // right
  ];
}

/**
 * Whether a tap that hit no rendered POI should fall through to a Nearby
 * Search. Below the threshold a tap spans hundreds of kilometres, so any
 * result would be arbitrary — and billed. Fly in instead.
 */
export function shouldFallbackToNearby(zoom: number): boolean {
  return zoom > NEARBY_MIN_ZOOM;
}

/**
 * Search radius in metres, proportional to what the user can actually see.
 * Roughly halves per zoom level, clamped to a range Google accepts.
 */
export function nearbyRadiusForZoom(zoom: number): number {
  const metres = 500 * Math.pow(2, 13 - zoom);
  return Math.round(Math.min(50000, Math.max(50, metres)));
}

/**
 * Cache key for a Nearby Search result, rounded to 4 decimal places (~11m) —
 * fine enough that two taps meant as "the same spot" collide, coarse enough
 * that adjacent-but-distinct spots don't share a billed result. Re-tapping
 * the same spot (the results sheet has no dismiss affordance, so tapping the
 * map to close it is the common path) should be free, not a fresh billed
 * Nearby Search every time.
 */
export function nearbyCacheKey(lat: number, lng: number): string {
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  return `${round4(lat)},${round4(lng)}`;
}

// ── Reconciling a tapped POI against the trip's own stops ────────────────────

/**
 * Two positions this close are the same place. Google's own coordinate for a
 * POI and Mapbox's rarely agree to the metre (different anchor conventions —
 * entrance vs centroid vs rooftop), but they never disagree by a block.
 */
export const SAME_PLACE_RADIUS_M = 30;

/** Great-circle distance in metres. Equirectangular would drift near the
 *  poles; at 30 m the extra cost of doing it properly is irrelevant. */
export function metersBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Finds the trip stop a tapped-and-resolved place actually IS, so the map can
 * select the existing stop instead of offering to add a duplicate.
 *
 * A Google placeId match is checked first and wins outright — when both sides
 * carry one, that is a real identity match and no distance can override it.
 * But most stops are Mapbox-grounded now and have `placeId: null`, so an
 * identity-only check misses the majority case: tapping a POI label further
 * from its pin than the pixel-proximity threshold covers would spend a billed
 * Text Search and then offer "Add to trip" for a stop already on the trip.
 * When either side lacks an id, fall back to the nearest stop within
 * SAME_PLACE_RADIUS_M. Stops that carry a DIFFERENT placeId than the resolved
 * place are excluded from that fallback — two separately-identified Google
 * places are distinct even when they sit metres apart.
 */
export function findStopMatchingPlace<
  T extends { placeId: string | null; lat: number; lng: number },
>(stops: T[], resolved: { placeId: string | null; lat: number; lng: number }): T | undefined {
  if (resolved.placeId) {
    const byId = stops.find((s) => s.placeId === resolved.placeId);
    if (byId) return byId;
  }

  let best: { stop: T; distance: number } | undefined;
  for (const stop of stops) {
    if (stop.placeId && resolved.placeId) continue;
    const distance = metersBetween(stop.lat, stop.lng, resolved.lat, resolved.lng);
    if (distance <= SAME_PLACE_RADIUS_M && (!best || distance < best.distance)) {
      best = { stop, distance };
    }
  }
  return best?.stop;
}
