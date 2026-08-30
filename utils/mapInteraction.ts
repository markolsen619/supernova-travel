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
