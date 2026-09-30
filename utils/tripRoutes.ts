import type { ActivityType, TripStatus } from '@/types';

/**
 * Pure geometry for the trip map (components/trip/TripMapView). Every "which
 * kind of line, from where to where, how long" decision lives here so it can
 * be tested; the only network call is services/mapboxDirections.
 */

export type LegMode = 'walking' | 'driving' | 'arc';

export interface RouteStop {
  id: string;
  type: ActivityType;
  title: string;
  notes: string;
  lat: number;
  lng: number;
}

export interface CachedLeg {
  mode: LegMode;
  /** Mapbox polyline6; null when the leg is drawn as an arc. */
  polyline: string | null;
  meters: number;
}

export type LegCache = Record<string, CachedLeg>;

export interface MissingLeg {
  key: string;
  mode: 'walking' | 'driving';
  a: RouteStop;
  b: RouteStop;
}

export interface BuiltPath {
  /** [lng, lat], the whole path in order. */
  coordinates: [number, number][];
  /** Where each input stop sits along the path, 0 → 1, by distance. */
  stopFractions: number[];
  meters: number;
  /** Walking/driving legs with no cached route yet — drawn as arcs meanwhile. */
  missing: MissingLeg[];
}

type LatLng = { lat: number; lng: number };

export const WALK_MAX_METERS = 2_500;
export const ARC_MIN_METERS = 400_000;
const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const WATER_CROSSING = /\b(ferry|boat|catamaran|cruise)\b/i;

export function legMode(a: RouteStop, b: RouteStop): LegMode {
  if (a.type === 'flight' || b.type === 'flight') return 'arc';
  for (const s of [a, b]) {
    if (s.type === 'transport' && WATER_CROSSING.test(`${s.title} ${s.notes}`)) return 'arc';
  }
  const meters = haversineMeters(a, b);
  if (meters > ARC_MIN_METERS) return 'arc';
  return meters < WALK_MAX_METERS ? 'walking' : 'driving';
}

export function legKey(mode: LegMode, a: LatLng, b: LatLng): string {
  const p = (n: number) => n.toFixed(5);
  return `${mode}:${p(a.lat)},${p(a.lng)}>${p(b.lat)},${p(b.lng)}`;
}

/** Spherical interpolation; longitudes are unwrapped so the antimeridian is crossed the short way. */
export function greatCircleArc(a: LatLng, b: LatLng, steps = 32): [number, number][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng), φ2 = toRad(b.lat), λ2 = toRad(b.lng);
  const d = haversineMeters(a, b) / EARTH_RADIUS_M;
  if (d === 0) return [[a.lng, a.lat], [b.lng, b.lat]];
  const out: [number, number][] = [];
  let prevLng: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    let lng = toDeg(Math.atan2(y, x));
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

export function decodePolyline6(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

function lineMeters(coords: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += haversineMeters({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] });
  }
  return m;
}

export function buildPath(stops: RouteStop[], cache: LegCache): BuiltPath {
  if (stops.length === 0) return { coordinates: [], stopFractions: [], meters: 0, missing: [] };
  const coordinates: [number, number][] = [[stops[0].lng, stops[0].lat]];
  const stopMeters: number[] = [0];
  const missing: MissingLeg[] = [];
  let meters = 0;

  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const mode = legMode(a, b);
    const key = legKey(mode, a, b);
    const cached = cache[key];
    let leg: [number, number][];
    let legM: number;

    if (cached?.polyline) {
      leg = decodePolyline6(cached.polyline);
      legM = cached.meters;
    } else {
      leg = greatCircleArc(a, b);
      legM = cached?.meters ?? lineMeters(leg);
      if (!cached && mode !== 'arc' && haversineMeters(a, b) > 0) missing.push({ key, mode, a, b });
    }
    coordinates.push(...leg.slice(1), [b.lng, b.lat]);
    meters += legM;
    stopMeters.push(meters);
  }

  const stopFractions = stopMeters.map((m) => (meters === 0 ? 0 : m / meters));
  return { coordinates, stopFractions, meters, missing };
}

export function pointAlongPath(coords: [number, number][], t: number): { point: [number, number]; bearing: number } {
  if (coords.length === 0) return { point: [0, 0], bearing: 0 };
  if (coords.length === 1) return { point: coords[0], bearing: 0 };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const l = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const f = segLens[i] === 0 ? 0 : Math.min(1, target / segLens[i]);
      const [x0, y0] = coords[i], [x1, y1] = coords[i + 1];
      const bearing = (toDeg(Math.atan2(x1 - x0, y1 - y0)) + 360) % 360;
      return { point: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], bearing };
    }
    target -= segLens[i];
  }
  return { point: coords[coords.length - 1], bearing: 0 };
}

/** Native marker views are costly: shown only close in, and past 40 stops only for the selected day. */
export const MARKER_MIN_ZOOM = 11;
export const MARKER_MAX_COUNT = 40;
export function markerStops<T extends { dayId: string }>(zoom: number, stops: T[], selectedDayId: string | null): T[] {
  if (zoom < MARKER_MIN_ZOOM) return [];
  if (stops.length <= MARKER_MAX_COUNT) return stops;
  return selectedDayId ? stops.filter((s) => s.dayId === selectedDayId) : [];
}

/**
 * Stops drawn as small native dots at overview zoom. Native views rather than
 * a CircleLayer, which drew nothing on the trip map in testing; past
 * MARKER_MAX_COUNT the CircleLayer is the (cheaper) fallback.
 */
export function overviewDots<T>(closeIn: boolean, stops: T[]): T[] {
  if (closeIn || stops.length > MARKER_MAX_COUNT) return [];
  return stops;
}

/** Visited stops in the order they were checked off — the trip as actually taken. */
export function actualStopOrder<T extends { visited: boolean; visitedAt: { toMillis(): number } | null; order: number }>(
  days: { dayNumber: number; stops: T[] }[],
): T[] {
  const withDay = days.flatMap((d) => d.stops.filter((s) => s.visited && s.visitedAt).map((s) => ({ s, day: d.dayNumber })));
  withDay.sort((x, y) =>
    x.s.visitedAt!.toMillis() - y.s.visitedAt!.toMillis() || x.day - y.day || x.s.order - y.s.order);
  return withDay.map((x) => x.s);
}

/** Planned | Actual appears once there's something actual to show. */
export function actualViewAvailable(input: { status: TripStatus; endDate: Date | null; anyVisited: boolean; now: Date }): boolean {
  if (input.status === 'completed' || input.anyVisited) return true;
  return !!input.endDate && input.endDate.getTime() < input.now.getTime();
}
