import { pointAlongPath, zoomForLeg } from '@/utils/tripRoutes';

/**
 * Cinematic flyover camera (Google Earth / Apple Flyover feel): face where the
 * route is going rather than the segment under the camera, turn smoothly, and
 * rise between stops and come down into the next. Pure — the map applies it.
 */
type Travel = Parameters<typeof zoomForLeg>[0];

const toDeg = (r: number) => (r * 180) / Math.PI;

/** The bearing from the point at `t` to the point `span` further along — through kinks, not with them. */
export function aheadBearing(coords: [number, number][], t: number, span: number): number {
  const a = pointAlongPath(coords, t).point;
  const b = pointAlongPath(coords, Math.min(1, t + span)).point;
  if (a[0] === b[0] && a[1] === b[1]) return pointAlongPath(coords, t).bearing;
  return (toDeg(Math.atan2(b[0] - a[0], b[1] - a[1])) + 360) % 360;
}

/** Turn from `prev` toward `next` by at most `maxDeg`, the short way round. */
export function limitTurn(prev: number, next: number, maxDeg: number): number {
  const diff = ((next - prev + 540) % 360) - 180;
  const step = Math.max(-maxDeg, Math.min(maxDeg, diff));
  return (prev + step + 360) % 360;
}

/**
 * Zoom along a leg: at the leg's own zoom near both stops, higher in the middle —
 * more the longer the leg (a walk barely lifts, a long drive climbs ~2.5 levels).
 */
export function legZoom(travel: Travel, meters: number, t: number): number {
  const base = zoomForLeg(travel, meters);
  const km = meters / 1000;
  const lift = travel === 'walk' ? Math.min(0.4, km / 3) : Math.min(2.5, Math.max(0.5, Math.log2(km + 1) / 2));
  return base - lift * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
}
