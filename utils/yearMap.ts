/** Year in Travel's world map: equirectangular projection (lat 85…−60, Antarctica cropped) and arcs the short way round. Pure. */
import dots from '@/assets/yearInTravel/worldDots.json';
const TOP = 85, BOTTOM = -60;
export function project(lat: number, lng: number, width: number, height: number) {
  return { x: Math.round(((lng + 180) / 360) * width * 100) / 100, y: Math.round(((TOP - lat) / (TOP - BOTTOM)) * height * 100) / 100 };
}
export function shortLngDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
export function arcPath(a: { lat: number; lng: number }, b: { lat: number; lng: number }, width: number, height: number): string {
  const p = project(a.lat, a.lng, width, height);
  const q = project(b.lat, a.lng + shortLngDelta(a.lng, b.lng), width, height);
  const lift = Math.min(40, Math.hypot(q.x - p.x, q.y - p.y) * 0.25);
  const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2 - lift;
  return `M${p.x} ${p.y} Q${Math.round(cx * 100) / 100} ${Math.round(cy * 100) / 100} ${q.x} ${q.y}`;
}
export const worldDots = (): [number, number][] => dots as [number, number][];
