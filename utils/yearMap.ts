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

/** The arc shifted sideways by `dx` (for the copy drawn on the other edge). */
function shiftPath(d: string, dx: number): string {
  const n = d.replace(/^M/, '').replace('Q', '').trim().split(/\s+/).map(Number);
  const r = (v: number) => Math.round(v * 100) / 100;
  return `M${r(n[0] + dx)} ${n[1]} Q${r(n[2] + dx)} ${n[3]} ${r(n[4] + dx)} ${n[5]}`;
}

/**
 * The arc as drawn: one path, or two when it crosses the date line — the arc leaves one edge and the copy
 * shifted by the map's width arrives from the other, so Tokyo → Los Angeles actually reaches LA (review, 2026-11-01).
 */
export function arcPaths(a: { lat: number; lng: number }, b: { lat: number; lng: number }, width: number, height: number): string[] {
  const d = arcPath(a, b, width, height);
  const endLng = a.lng + shortLngDelta(a.lng, b.lng);
  if (endLng > 180) return [d, shiftPath(d, -width)];
  if (endLng < -180) return [d, shiftPath(d, width)];
  return [d];
}

/** Every land dot as one SVG path of tiny round-capped strokes: one native view instead of thousands. */
export function dotsPath(width: number, height: number): string {
  return worldDots().map(([lat, lng]) => { const p = project(lat, lng, width, height); return `M${p.x} ${p.y}h0.01`; }).join('');
}
