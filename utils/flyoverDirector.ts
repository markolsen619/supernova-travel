/**
 * The trip flyover's director (spec 2026-11-11-flyover-director-design.md): plans each day as a few long, seamless
 * camera shots — establish, glide, feature, transfer — so playback feels like flying above the trip as it comes alive.
 * Pure: no React, no Mapbox. TripMapView runs the plan; utils/flyover's reducer stays the clock.
 */
import { haversineMeters } from '@/utils/tripRoutes';
import { legPitch } from '@/utils/flyoverCamera';
import { momentStop, stripDayPrefix } from '@/utils/highlights';
import { travelLabel } from '@/utils/playback';
import type { Travel } from '@/utils/tripRoutes';
import { FILM_BUDGET_MS } from '@/utils/flyover';

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

/**
 * Each route's geometry, measured once (final review C1: re-sampling and re-smoothing the whole day for every span and
 * every lift froze long trips for seconds). Keyed on the coordinates array itself — stable while the route is.
 */
type Geometry = { raw: Sample[]; pathM: number; smooth: Map<number, Sample[]> };
const geometries = new WeakMap<[number, number][], Geometry>();
function geometryOf(coords: [number, number][]): Geometry {
  let g = geometries.get(coords);
  if (!g) {
    let pathM = 0;
    for (let k = 1; k < coords.length; k++) pathM += haversineMeters({ lat: coords[k - 1][1], lng: coords[k - 1][0] }, { lat: coords[k][1], lng: coords[k][0] });
    g = { raw: samplePath(coords), pathM, smooth: new Map() };
    geometries.set(coords, g);
  }
  return g;
}
const smoothOf = (g: Geometry, windowM: number) => {
  let s = g.smooth.get(windowM);
  if (!s) { s = smoothLine(g.raw, windowM); g.smooth.set(windowM, s); }
  return s;
};
/** The first sample at or after fraction f (samples are sorted by f). */
function lowerBound(s: Sample[], f: number): number {
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].f < f) lo = mid + 1; else hi = mid; }
  return lo;
}
const nearest = (s: Sample[], f: number) => {
  const i = Math.min(s.length - 1, lowerBound(s, f));
  return i > 0 && Math.abs(s[i - 1].f - f) <= Math.abs(s[i].f - f) ? s[i - 1] : s[i];
};

/**
 * Glides over path fractions [from, to]: 2–4 s `linearTo` segments, each covering an equal share of the real route at
 * the screen-speed cap (timed on the route itself — the smoothed line is shorter and would let the head outrun the cap),
 * aimed along the smoothed line with the heading eased ≤ 12°/s. `slowIn` lengthens the last two (×1.4, ×1.8).
 */
export function glideSegments(i: { coords: [number, number][]; zoom: number; windowM: number; from: number; to: number; slowIn: boolean; startBearing: number }): Segment[] {
  if (!(i.to > i.from) || i.coords.length < 2) return [];
  const geo = geometryOf(i.coords);
  const smooth = smoothOf(geo, i.windowM);
  const lo = lowerBound(geo.raw, i.from - 1e-9), hi = lowerBound(geo.raw, i.to + 1e-9);
  if (hi - lo < 2 && !(geo.pathM > 0)) return [];
  const lat = geo.raw[Math.min(lo, geo.raw.length - 1)].lat;
  const meters = (i.to - i.from) * geo.pathM;
  const mps = SCREEN_SPEED_PTS * metersPerPoint(lat, i.zoom);
  const totalMs = Math.max(SEG_MIN_MS, (meters / mps) * 1000);
  const n = Math.max(1, Math.ceil(totalMs / SEG_MAX_MS));
  const ms = totalMs / n;
  const segs: Segment[] = [];
  let bearing = i.startBearing;
  for (let s = 0; s < n; s++) {
    const f0 = i.from + ((i.to - i.from) * s) / n, f1 = s === n - 1 ? i.to : i.from + ((i.to - i.from) * (s + 1)) / n;
    const start = nearest(smooth, f0), end = nearest(smooth, f1);
    const want = start === end ? bearing : bearingOf(start, end);
    const limit = MAX_TURN_DEG_S * (ms / 1000);
    bearing = norm(bearing + Math.max(-limit, Math.min(limit, angleDelta(bearing, want))));
    segs.push({ from: f0, to: f1, ms, move: 'linearTo', camera: { center: [end.lng, end.lat], zoom: i.zoom, pitch: legPitch(i.zoom), bearing } });
  }
  // Slow into a feature over the last two segments; a one-segment span is already at its slowest (2 s floor).
  if (i.slowIn && segs.length >= 2) {
    segs[segs.length - 1].ms *= 1.8;
    segs[segs.length - 2].ms *= 1.4;
  }
  return segs;
}

/** The direction a span heads (along the smoothed line), to start a day's glide facing the route (final review M1). */
export function spanBearing(coords: [number, number][], windowM: number, from: number, to: number): number | null {
  if (!(to > from) || coords.length < 2) return null;
  const smooth = smoothOf(geometryOf(coords), windowM);
  const a = nearest(smooth, from), b = nearest(smooth, Math.min(to, from + Math.max((to - from) / 3, 1e-6)));
  return a === b ? null : bearingOf(a, b);
}

/** The segment holding `progress` (the last one at or past the end) — where a resumed glide picks up. */
export function segmentAt(segments: { from: number; to: number }[], progress: number): number {
  for (let k = 0; k < segments.length; k++) if (progress < segments[k].to) return k;
  return Math.max(0, segments.length - 1);
}

// ── Day plans ─────────────────────────────────────────────────────────────────

export type DirectorStop = {
  id: string; name: string; type: string; lat: number; lng: number; photoCount: number;
  /** The stop's own day, for paths spanning several days (whole trip, actual route — final review I3). */
  dayNumber?: number; dayLabel?: string | null; dayCity?: string | null;
};
export type DirectorDay = {
  dayId: string; dayNumber: number; label: string | null; city: string | null; stops: DirectorStop[];
  path: { coordinates: [number, number][]; stopFractions: number[]; meters: number; legs: { travel: string; startFraction: number; endFraction: number; meters: number }[] };
};
export type DayPlan = {
  dayId: string;
  establish: { camera: Camera; overviewMs: number; descendMs: number; bounds: { ne: [number, number]; sw: [number, number] } | null };
  transfer: { camera: Camera; ms: number; label: string } | null;
  introMs: number; features: number[]; featureMs: Record<number, number>; dwells: number[];
  segments: Segment[]; profile: { to: number; ms: number }[]; glideMs: number;
  cards: { eyebrow: string; titles: string[]; eyebrows: string[] };
};
type PlanOpts = { long: boolean; film: boolean; overview?: boolean; features?: 'all' | 'photos' | 'none'; quickTransfers?: boolean };

const TRANSFER_M = 25_000;
const GLIDE_ZOOM_MIN = 11;
const legZoomFor = (t: string) => (t === 'walk' ? 15 : t === 'drive' || t === 'bus' ? 13.5 : 12);
const windowFor = (t: string) => (t === 'walk' ? 600 : 2000);
const transferMs = (meters: number) => Math.round(Math.min(5000, 3000 + (meters / 200_000) * 1000));

/** `DAY 3 · ANCIENT PYRAMIDS & CULINARY` — the day's title without "Day N:", else its city, else just the day. */
export function dayEyebrow(dayNumber: number, label: string | null, city: string | null): string {
  const place = stripDayPrefix(label) ?? city;
  return place ? `DAY ${dayNumber} · ${place.toUpperCase()}` : `DAY ${dayNumber}`;
}

/** Key places: every stop on short trips; on long trips ≤ 3 — photos first, then sights, then the most central. */
export function pickFeatures(stops: DirectorStop[], long: boolean): number[] {
  if (!long) return stops.map((_, i) => i);
  // A path spanning several days (whole trip, actual route) caps features per source day (final review I3).
  const groups = new Map<number | undefined, number[]>();
  stops.forEach((st, i) => { const k = st.dayNumber; groups.set(k, [...(groups.get(k) ?? []), i]); });
  if (groups.size > 1) {
    return [...groups.values()].flatMap((idx) => pickFeatures(idx.map((i) => stops[i]), true).map((k) => idx[k])).sort((a, b) => a - b);
  }
  const centre = stops.length ? (momentStop(stops as never) as unknown as DirectorStop | null) : null;
  const rank = (s: DirectorStop) => (s.photoCount > 0 ? 0 : s.type === 'activity' ? 1 : s === centre ? 2 : 3);
  return stops.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).slice(0, 3).map((x) => x.i).sort((a, b) => a - b);
}

function featureHoldMs(photos: number, o: PlanOpts): number {
  if (o.film) return 3000 + 1500 * Math.min(photos, 2);
  return (o.long ? 3000 : 4000) + 2000 * Math.min(photos, 4);
}

function boundsOf(coords: [number, number][]) {
  if (coords.length < 2) return null;
  const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return { ne: [Math.max(...lngs), Math.max(...lats)] as [number, number], sw: [Math.min(...lngs), Math.min(...lats)] as [number, number] };
}

function planDay(day: DirectorDay, prev: DirectorDay | null, o: PlanOpts): DayPlan {
  const p = day.path;
  const first = day.stops[0];
  let features = o.features === 'none' ? [] : pickFeatures(day.stops, o.long);
  if (o.features === 'photos') features = features.filter((i) => day.stops[i].photoCount > 0);
  const featureMs: Record<number, number> = {};
  for (const i of features) featureMs[i] = featureHoldMs(day.stops[i].photoCount, o);
  // Glides run between features (and the day's ends); legs over 25 km are one transfer arc instead.
  const featureFs = features.map((i) => p.stopFractions[i] ?? 0);
  const legEnds = p.legs.filter((l) => l.meters > TRANSFER_M).flatMap((l) => [l.startFraction, l.endFraction]);
  const marks = [...new Set([0, ...featureFs, ...legEnds, 1].map((f) => Math.min(1, Math.max(0, f))))].sort((a, b) => a - b);
  const legAt = (f: number) => p.legs.find((l) => f >= l.startFraction - 1e-9 && f < l.endFraction - 1e-9) ?? p.legs[p.legs.length - 1];
  const glideCap = o.long ? 6000 : Infinity;
  // Start facing where the day's route first heads, not north (final review M1).
  const firstLeg = p.legs[0];
  const seedBearing = spanBearing(p.coordinates, windowFor(firstLeg?.travel ?? 'walk'), 0, marks[1] ?? 1) ?? 0;
  const build = (lift: number): Segment[] => {
    const out: Segment[] = [];
    let bearing = seedBearing;
    for (let k = 1; k < marks.length; k++) {
      const from = marks[k - 1], to = marks[k];
      if (!(to > from)) continue;
      const leg = legAt(from);
      if (leg && leg.meters > TRANSFER_M) {
        const end = p.coordinates[p.coordinates.length - 1];
        const target = day.stops.find((_, i) => Math.abs((p.stopFractions[i] ?? -1) - to) < 1e-9);
        out.push({ from, to, ms: transferMs(leg.meters), move: 'flyTo', camera: { center: target ? [target.lng, target.lat] : end, zoom: GLIDE_ZOOM_MIN, pitch: 40, bearing: 0 } });
        continue;
      }
      const travel = leg?.travel ?? 'walk';
      const zoom = Math.max(GLIDE_ZOOM_MIN, legZoomFor(travel) - lift);
      const intoFeature = featureFs.some((f) => Math.abs(f - to) < 1e-9);
      const g = glideSegments({ coords: p.coordinates, zoom, windowM: windowFor(travel), from, to, slowIn: intoFeature, startBearing: bearing });
      if (g.length) bearing = g[g.length - 1].camera.bearing;
      out.push(...g);
    }
    return out;
  };
  let segments: Segment[] = [];
  if (p.coordinates.length < 2) segments = [];
  else if (o.overview) {
    const b = boundsOf(p.coordinates)!;
    segments = [{ from: 0, to: 1, ms: 1500, move: 'linearTo', camera: { center: [(b.ne[0] + b.sw[0]) / 2, (b.ne[1] + b.sw[1]) / 2], zoom: 12, pitch: 40, bearing: 0 } }];
  } else {
    // A long day flies higher (never under zoom 11) so its glide stays calm and short.
    for (let lift = 0; lift <= 4; lift += 0.5) {
      segments = build(lift);
      if (segments.filter((x) => x.move !== 'flyTo').reduce((a, x) => a + x.ms, 0) <= glideCap) break;
    }
  }
  const glideMs = segments.reduce((a, x) => a + x.ms, 0);
  let establishMs = o.film ? 2000 : 3000;
  const centre: [number, number] = first ? [first.lng, first.lat] : p.coordinates[0] ?? [0, 0];
  const start = segments[0]?.camera;
  let transfer: DayPlan['transfer'] = null;
  const prevLast = prev?.stops[prev.stops.length - 1];
  if (prevLast && first) {
    const m = haversineMeters(prevLast, first);
    if (m > TRANSFER_M) {
      const travel: Travel = m > 400_000 ? 'flight' : 'drive';
      // The card names where the arc lands — the city when known (final review I5: not "By plane to Hotel Ritz").
      transfer = { camera: { center: centre, zoom: GLIDE_ZOOM_MIN, pitch: 40, bearing: 0 }, ms: o.quickTransfers ? 1800 : transferMs(m), label: travelLabel(travel, day.city ?? first.name) };
      // A squeezed video lands from the arc straight into the day (final review I6).
      if (o.quickTransfers) establishMs = 0;
    }
  }
  const establish = {
    camera: { center: centre, zoom: start?.zoom ?? 15, pitch: start?.pitch ?? 50, bearing: start?.bearing ?? 0 },
    overviewMs: Math.round(establishMs * 0.6), descendMs: Math.round(establishMs * 0.4), bounds: boundsOf(p.coordinates),
  };
  const introMs = (transfer?.ms ?? 0) + establishMs + (featureMs[0] ?? 0);
  const dwells = day.stops.map((_, i) => (i > 0 && features.includes(i) ? featureMs[i] : 0));
  return {
    dayId: day.dayId, establish, transfer, introMs, features, featureMs, dwells, segments,
    profile: segments.map((x) => ({ to: x.to, ms: x.ms })), glideMs,
    cards: {
      eyebrow: dayEyebrow(day.dayNumber, day.label, day.city),
      titles: day.stops.map((st) => st.name),
      eyebrows: day.stops.map((st) => (st.dayNumber != null ? dayEyebrow(st.dayNumber, st.dayLabel ?? null, st.dayCity ?? null) : dayEyebrow(day.dayNumber, day.label, day.city))),
    },
  };
}

const planTotal = (plans: DayPlan[]) => plans.reduce((a, d) => a + d.introMs + d.glideMs + d.dwells.reduce((x, y) => x + y, 0), 0);

/**
 * Every day's plan, and the whole flyover's length. Film fits `budgetMs` (≈ 1 minute) by squeezing in order: features at
 * photo stops only → overview glides (the camera stays high, so the fast draw stays calm) → no features. Never faster
 * than the playback cap; a very long trip's video can still run over (it ends, it isn't rushed).
 */
export function directFlyover(days: DirectorDay[], o: { long: boolean; film: boolean; budgetMs?: number }): { days: DayPlan[]; totalMs: number } {
  const run = (extra: Partial<PlanOpts>) => days.map((d, i) => planDay(d, days[i - 1] ?? null, { long: o.long, film: o.film, ...extra }));
  if (!o.film) { const plans = run({}); return { days: plans, totalMs: planTotal(plans) }; }
  const budget = o.budgetMs ?? FILM_BUDGET_MS;
  const steps: Partial<PlanOpts>[] = [
    { features: 'all' }, { features: 'photos' }, { features: 'photos', overview: true },
    // Multi-city trips: shorter arcs, and no establish right after one (final review I6: a 14-day trip ran 96 s).
    { features: 'photos', overview: true, quickTransfers: true }, { features: 'none', overview: true, quickTransfers: true },
  ];
  let plans: DayPlan[] = [];
  for (const step of steps) {
    plans = run(step);
    if (planTotal(plans) <= budget) break;
  }
  return { days: plans, totalMs: planTotal(plans) };
}

// ── Running the plan: pause, resume and drift (final review I1, I2, I4) ─────────────────────────────────────────────

/**
 * A hold's camera phases (opening: transfer → overview → descend → feature; or a feature's in → orbit) resumed after
 * `elapsedMs` of the hold: finished phases are dropped and the current one finishes in its remaining time — resuming
 * used to replay the whole opening on top of the glide.
 */
export function resumePhases<T extends string>(phases: { id: T; at: number; ms: number }[], elapsedMs: number): { id: T; delay: number; ms: number }[] {
  return phases
    .filter((p) => p.at + p.ms > elapsedMs)
    .map((p) => (p.at >= elapsedMs ? { id: p.id, delay: p.at - elapsedMs, ms: p.ms } : { id: p.id, delay: 0, ms: p.at + p.ms - elapsedMs }));
}

/** Where the camera should be at `progress` within a day's glides (pausing holds it there instead of flying on). */
export function cameraAt(segments: Segment[], progress: number, start: Camera): Camera {
  if (!segments.length) return start;
  const k = segmentAt(segments, progress);
  const seg = segments[k];
  const from = k > 0 ? segments[k - 1].camera : start;
  const t = Math.min(1, Math.max(0, (progress - seg.from) / (seg.to - seg.from || 1)));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    center: [lerp(from.center[0], seg.camera.center[0]), lerp(from.center[1], seg.camera.center[1])],
    zoom: lerp(from.zoom, seg.camera.zoom), pitch: lerp(from.pitch, seg.camera.pitch),
    bearing: norm(from.bearing + angleDelta(from.bearing, seg.camera.bearing) * t),
  };
}

/** The camera's scheduled arrival and the drawing head's have drifted apart enough to resend the segment. */
export const needsResync = (scheduledLeftMs: number, expectedLeftMs: number) => Math.abs(scheduledLeftMs - expectedLeftMs) > 300;
