/**
 * The trip flyover's director (spec 2026-11-11-flyover-director-design.md): plans each day as a few long, seamless
 * camera shots — establish, glide, feature, transfer — so playback feels like flying above the trip as it comes alive.
 * Pure: no React, no Mapbox. TripMapView runs the plan; utils/flyover's reducer stays the clock.
 */
import { haversineMeters } from '@/utils/tripRoutes';
import { legPitch } from '@/utils/flyoverCamera';

export type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };
export type Segment = { from: number; to: number; ms: number; camera: Camera; move: 'linearTo' | 'easeTo' | 'flyTo' };
type Sample = { lng: number; lat: number; f: number };

/** 35% of a phone's width (390 pt) per second — calm at any zoom. */
export const SCREEN_SPEED_PTS = 0.35 * 390;
const MAX_TURN_DEG_S = 12;
const SEG_MAX_MS = 4000;
const SEG_MIN_MS = 2000;

/** Mapbox metres per screen point at a latitude and zoom (512 pt tiles). */
export const metersPerPoint = (lat: number, zoom: number) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** The signed shortest turn from bearing a to bearing b, in degrees (−180…180). */
export const angleDelta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
const norm = (d: number) => ((d % 360) + 360) % 360;

function bearingOf(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return norm((Math.atan2(y, x) * 180) / Math.PI);
}

/** The path every ~stepM metres, each point with its path fraction by distance. */
export function samplePath(coords: [number, number][], stepM = 50): Sample[] {
  if (coords.length < 2) return coords.map(([lng, lat]) => ({ lng, lat, f: 0 }));
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineMeters({ lat: coords[i - 1][1], lng: coords[i - 1][0] }, { lat: coords[i][1], lng: coords[i][0] }));
  const total = cum[cum.length - 1];
  if (total <= 0) return [{ lng: coords[0][0], lat: coords[0][1], f: 0 }, { lng: coords[0][0], lat: coords[0][1], f: 1 }];
  const out: Sample[] = [];
  let j = 1;
  for (let d = 0; d < total; d += stepM) {
    while (cum[j] < d) j++;
    const t = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push({ lng: coords[j - 1][0] + t * (coords[j][0] - coords[j - 1][0]), lat: coords[j - 1][1] + t * (coords[j][1] - coords[j - 1][1]), f: d / total });
  }
  out.push({ lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], f: 1 });
  return out;
}

/** A moving average over ~windowM: the camera floats above the street pattern instead of tracing every corner. */
export function smoothLine(s: Sample[], windowM: number): Sample[] {
  const k = Math.max(1, Math.round(windowM / 50 / 2));
  return s.map((p, i) => {
    if (i === 0 || i === s.length - 1) return p;
    const a = Math.max(0, i - k), b = Math.min(s.length - 1, i + k);
    let lng = 0, lat = 0;
    for (let x = a; x <= b; x++) { lng += s[x].lng; lat += s[x].lat; }
    return { lng: lng / (b - a + 1), lat: lat / (b - a + 1), f: p.f };
  });
}

const nearest = (s: Sample[], f: number) => s.reduce((best, p) => (Math.abs(p.f - f) < Math.abs(best.f - f) ? p : best), s[0]);

/**
 * Glides over path fractions [from, to]: 2–4 s `linearTo` segments, each covering an equal share of the real route at
 * the screen-speed cap (timed on the route itself — the smoothed line is shorter and would let the head outrun the cap),
 * aimed along the smoothed line with the heading eased ≤ 12°/s. `slowIn` lengthens the last two (×1.4, ×1.8).
 */
export function glideSegments(i: { coords: [number, number][]; zoom: number; windowM: number; from: number; to: number; slowIn: boolean; startBearing: number }): Segment[] {
  if (!(i.to > i.from)) return [];
  const raw = samplePath(i.coords);
  const smooth = smoothLine(raw, i.windowM);
  const span = raw.filter((p) => p.f >= i.from - 1e-9 && p.f <= i.to + 1e-9);
  const smoothSpan = smooth.filter((p) => p.f >= i.from - 1e-9 && p.f <= i.to + 1e-9);
  if (span.length < 2) return [];
  // The exact route length (samples every 50 m cut corners and read short — the head would outrun the cap).
  let pathM = 0;
  for (let k = 1; k < i.coords.length; k++) pathM += haversineMeters({ lat: i.coords[k - 1][1], lng: i.coords[k - 1][0] }, { lat: i.coords[k][1], lng: i.coords[k][0] });
  const meters = (i.to - i.from) * pathM;
  const mps = SCREEN_SPEED_PTS * metersPerPoint(span[0].lat, i.zoom);
  const totalMs = Math.max(SEG_MIN_MS, (meters / mps) * 1000);
  const n = Math.max(1, Math.ceil(totalMs / SEG_MAX_MS));
  const ms = totalMs / n;
  const segs: Segment[] = [];
  let bearing = i.startBearing;
  for (let s = 0; s < n; s++) {
    const f0 = i.from + ((i.to - i.from) * s) / n, f1 = s === n - 1 ? i.to : i.from + ((i.to - i.from) * (s + 1)) / n;
    const start = nearest(smoothSpan, f0), end = nearest(smoothSpan, f1);
    const want = start === end ? bearing : bearingOf(start, end);
    const limit = MAX_TURN_DEG_S * (ms / 1000);
    bearing = norm(bearing + Math.max(-limit, Math.min(limit, angleDelta(bearing, want))));
    segs.push({ from: f0, to: f1, ms, move: 'linearTo', camera: { center: [end.lng, end.lat], zoom: i.zoom, pitch: legPitch(i.zoom), bearing } });
  }
  if (i.slowIn) {
    segs[segs.length - 1].ms *= 1.8;
    if (segs.length >= 2) segs[segs.length - 2].ms *= 1.4;
  }
  return segs;
}

/** The segment holding `progress` (the last one at or past the end) — where a resumed glide picks up. */
export function segmentAt(segments: { from: number; to: number }[], progress: number): number {
  for (let k = 0; k < segments.length; k++) if (progress < segments[k].to) return k;
  return Math.max(0, segments.length - 1);
}
