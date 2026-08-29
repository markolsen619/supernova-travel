/**
 * Camera geometry for the globe. Pure so the zoom bands and their exact
 * boundaries are testable without a map instance.
 */

/** Below this, the globe is the subject and any tilt distorts it. */
const FLAT_BELOW_ZOOM = 8;
/** At and above this, 3D buildings are rendered and worth looking at. */
const STEEP_FROM_ZOOM = 13;

/**
 * Camera pitch for a target zoom.
 *
 * The whole point: `StyleImport` sets `show3dBuildings: true`, but a pitch-0
 * camera looks straight down, where 3D is invisible. Tilting at close zoom is
 * the only way that setting produces anything.
 */
export function pitchForZoom(zoom: number): number {
  if (zoom < FLAT_BELOW_ZOOM) return 0;
  if (zoom < STEEP_FROM_ZOOM) return 45;
  return 55;
}

/**
 * A small bearing offset so arrivals are not all mechanically north-locked.
 *
 * Derived from longitude rather than randomised: revisiting the same place
 * must frame it the same way, or the map feels unstable.
 */
export function headingForArrival(lng: number): number {
  // Longitude is already well distributed across the globe; folding it to a
  // ±25° band gives variety without ever looking crooked.
  const folded = ((Math.abs(lng) * 7) % 50) - 25;
  return Math.round(folded);
}
