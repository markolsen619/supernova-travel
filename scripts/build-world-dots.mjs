/**
 * Builds assets/yearInTravel/worldDots.json for Year in Travel's map: land points on a 2.5° grid (lat 85…−60),
 * from Natural Earth 110 m land (public domain) via the world-atlas package. Run once: node scripts/build-world-dots.mjs
 */
import { writeFileSync } from 'node:fs';

const STEP = 2.5;
const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).json();
const { scale, translate } = topo.transform;

// Decode delta-quantized arcs into [lng, lat] points.
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const ring = (indices) => indices.flatMap((i, k) => {
  const pts = i >= 0 ? arcs[i] : [...arcs[~i]].reverse();
  return k === 0 ? pts : pts.slice(1);
});
const polygons = [];
for (const g of topo.objects.land.geometries) {
  if (g.type === 'Polygon') polygons.push(g.arcs.map(ring));
  if (g.type === 'MultiPolygon') for (const p of g.arcs) polygons.push(p.map(ring));
}
const inRing = (lng, lat, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (lng, lat) => polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));

const dots = [];
for (let lat = 85; lat >= -60; lat -= STEP) {
  for (let lng = -180 + STEP / 2; lng < 180; lng += STEP) if (onLand(lng, lat)) dots.push([lat, Math.round(lng * 100) / 100]);
}
writeFileSync('assets/yearInTravel/worldDots.json', JSON.stringify(dots));
console.log('land dots', dots.length);
