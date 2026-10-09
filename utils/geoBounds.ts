import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

/** Mapbox bbox order: west, south, east, north. */
export type Bbox = [number, number, number, number];

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Google viewport corners are [lng, lat] (see viewportToBounds). Returns null
 *  rather than a malformed box — a bad box would silently widen the search
 *  back to global, which is the failure mode this whole design exists to avoid. */
export function boundsToBbox(bounds: PlaceViewportBounds | null | undefined): Bbox | null {
  if (!bounds?.sw || !bounds?.ne) return null;
  const [w, s] = bounds.sw;
  const [e, n] = bounds.ne;
  if (![w, s, e, n].every(finite)) return null;
  return [w, s, e, n];
}

export function bboxCenter(bbox: Bbox): { lat: number; lng: number } {
  const [w, s, e, n] = bbox;
  return { lng: (w + e) / 2, lat: (s + n) / 2 };
}

/** A box must have area and must not wrap the antimeridian. Mapbox rejects
 *  wrapped boxes, and a zero-area box matches nothing. */
export function isBboxUsable(bbox: Bbox | null): boolean {
  if (!bbox) return false;
  const [w, s, e, n] = bbox;
  if (![w, s, e, n].every(finite)) return false;
  return e > w && n > s;
}

/**
 * Whether a destination's box actually contains the destination (with a
 * little slack, `margin` degrees ≈ 2 km). A box found by name alone can be a
 * namesake elsewhere — "Mission Beach" matched the city of Mission, Texas, and
 * every stop of a San Diego trip was then searched for in Texas.
 */
export function boundsHoldPoint(bounds: PlaceViewportBounds, point: { lat: number; lng: number }, margin = 0.02): boolean {
  const [w, s] = bounds.sw;
  const [e, n] = bounds.ne;
  return point.lng >= w - margin && point.lng <= e + margin && point.lat >= s - margin && point.lat <= n + margin;
}

/** A square box of ±`degrees` around a point — when no city box can be trusted. */
export function boxAround(point: { lat: number; lng: number }, degrees: number): PlaceViewportBounds {
  return { sw: [point.lng - degrees, point.lat - degrees], ne: [point.lng + degrees, point.lat + degrees] };
}
