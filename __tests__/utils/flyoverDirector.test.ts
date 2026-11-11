import { angleDelta, glideSegments, metersPerPoint, samplePath, segmentAt, smoothLine, SCREEN_SPEED_PTS } from '@/utils/flyoverDirector';
import { haversineMeters } from '@/utils/tripRoutes';

// A zig-zag walk through a city grid at Mexico City's latitude.
const zig: [number, number][] = [[-99.133, 19.432], [-99.128, 19.432], [-99.128, 19.428], [-99.122, 19.428], [-99.122, 19.424], [-99.116, 19.424]];
const zigMeters = zig.slice(1).reduce((a, c, i) => a + haversineMeters({ lat: zig[i][1], lng: zig[i][0] }, { lat: c[1], lng: c[0] }), 0);

describe('geometry', () => {
  it('samples a path every ~50 m with fractions 0..1', () => {
    const s = samplePath(zig);
    expect(s[0].f).toBe(0);
    expect(s[s.length - 1].f).toBeCloseTo(1);
    expect(s.length).toBeGreaterThan(40);
  });
  it('smoothing keeps the ends and the sample count', () => {
    const s = samplePath(zig);
    const m = smoothLine(s, 600);
    expect(m[0].lng).toBeCloseTo(s[0].lng, 6);
    expect(m.length).toBe(s.length);
  });
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
});

describe('glideSegments — comfort limits', () => {
  const segs = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: false, startBearing: 90 });
  it('covers the span exactly, in order, with no zero-length segment', () => {
    expect(segs[0].from).toBe(0);
    expect(segs[segs.length - 1].to).toBe(1);
    segs.forEach((g, i) => { expect(g.to).toBeGreaterThan(g.from); if (i) expect(g.from).toBe(segs[i - 1].to); });
  });
  it('every segment lasts 2–4 s (×1.8 at most when slowing in)', () => {
    segs.forEach((g) => { expect(g.ms).toBeGreaterThanOrEqual(2000); expect(g.ms).toBeLessThanOrEqual(4000); });
  });
  it('turns at most 12° a second', () => {
    let prev = 90;
    segs.forEach((g) => { expect(Math.abs(angleDelta(prev, g.camera.bearing))).toBeLessThanOrEqual(12 * (g.ms / 1000) + 1e-6); prev = g.camera.bearing; });
  });
  it('never moves faster than the screen-speed cap', () => {
    segs.forEach((g) => {
      const meters = (g.to - g.from) * zigMeters;
      const ptsPerSec = meters / metersPerPoint(19.43, g.camera.zoom) / (g.ms / 1000);
      expect(ptsPerSec).toBeLessThanOrEqual(SCREEN_SPEED_PTS * 1.01);
    });
  });
  it('slows into a feature (last two segments longer)', () => {
    const s = glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0, to: 1, slowIn: true, startBearing: 90 });
    const n = s.length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(s[n - 1].ms).toBeGreaterThan(s[n - 3].ms);
    expect(s[n - 2].ms).toBeGreaterThan(s[n - 3].ms);
  });
  it('a zero-length span (two stops at one spot) gives no segments (review focus 4)', () => {
    expect(glideSegments({ coords: zig, zoom: 15, windowM: 600, from: 0.4, to: 0.4, slowIn: true, startBearing: 0 })).toEqual([]);
  });
});

describe('segmentAt (review focus 3: resume mid-glide)', () => {
  const segs = [{ from: 0, to: 0.3 }, { from: 0.3, to: 0.7 }, { from: 0.7, to: 1 }];
  it('finds the segment under the head', () => {
    expect(segmentAt(segs, 0)).toBe(0);
    expect(segmentAt(segs, 0.5)).toBe(1);
    expect(segmentAt(segs, 0.7)).toBe(2);
    expect(segmentAt(segs, 1)).toBe(2);
  });
});

import { dayEyebrow, directFlyover, pickFeatures, type DirectorDay } from '@/utils/flyoverDirector';

const stop = (id: string, name: string, lat: number, lng: number, type = 'activity', photoCount = 0) => ({ id, name, type, lat, lng, photoCount });
const dayFrom = (n: number, stops: ReturnType<typeof stop>[], label: string | null = null): DirectorDay => {
  const coords = stops.map((s) => [s.lng, s.lat] as [number, number]);
  const cums = [0];
  for (let i = 1; i < stops.length; i++) cums.push(cums[i - 1] + haversineMeters(stops[i - 1], stops[i]));
  const cum = cums[cums.length - 1];
  return { dayId: `d${n}`, dayNumber: n, label, city: 'Mexico City', stops,
    path: { coordinates: coords, stopFractions: cums.map((c) => (cum ? c / cum : 0)), meters: cum,
      legs: stops.slice(1).map((_, i) => ({ travel: (cums[i + 1] - cums[i]) > 25_000 ? 'drive' : 'walk', startFraction: cum ? cums[i] / cum : 0, endFraction: cum ? cums[i + 1] / cum : 1, meters: cums[i + 1] - cums[i] })) } };
};
const cdmx = [stop('a', 'Zócalo', 19.4326, -99.1332), stop('b', 'Metropolitan Cathedral', 19.4342, -99.1331), stop('c', 'National Palace', 19.4327, -99.1313, 'activity', 2), stop('d', 'El Cardenal', 19.4357, -99.1385, 'restaurant')];

describe('pickFeatures', () => {
  it('every stop on short trips', () => {
    expect(pickFeatures(cdmx, false)).toEqual([0, 1, 2, 3]);
  });
  it('long trips: ≤ 3, photos first, then sights', () => {
    const f = pickFeatures([...cdmx, stop('e', 'Bellas Artes', 19.4352, -99.1412), stop('f', 'Café', 19.43, -99.14, 'restaurant')], true);
    expect(f).toHaveLength(3);
    expect(f).toContain(2);
    expect(f).not.toContain(5);
  });
});

describe('cards', () => {
  it('eyebrow uses the day title without "Day N:", else the city', () => {
    expect(dayEyebrow(3, 'Day 3: Ancient pyramids & culinary', 'Mexico City')).toBe('DAY 3 · ANCIENT PYRAMIDS & CULINARY');
    expect(dayEyebrow(3, null, 'Mexico City')).toBe('DAY 3 · MEXICO CITY');
    expect(dayEyebrow(3, null, null)).toBe('DAY 3');
  });
  it('titles are the stops\' own names — never the city (owner: "Mexico City" on every stop)', () => {
    const plan = directFlyover([dayFrom(1, cdmx)], { long: true, film: false }).days[0];
    expect(plan.cards.titles).toEqual(['Zócalo', 'Metropolitan Cathedral', 'National Palace', 'El Cardenal']);
    expect(plan.cards.titles).not.toContain('Mexico City');
  });
});

describe('directFlyover — playback', () => {
  const d = directFlyover([dayFrom(1, cdmx, 'Day 1: Centro')], { long: false, film: false }).days[0];
  it('dwells only at features after stop 0; others pulse past (0)', () => {
    const six = [...cdmx, stop('e', 'X', 19.44, -99.14, 'restaurant'), stop('f', 'Y', 19.441, -99.141, 'restaurant')];
    const long = directFlyover([dayFrom(1, six)], { long: true, film: false }).days[0];
    long.dwells.forEach((ms, i) => expect(ms > 0).toBe(long.features.includes(i) && i > 0));
  });
  it('the profile covers 0 → 1 and its time equals the glides', () => {
    expect(d.profile[d.profile.length - 1].to).toBeCloseTo(1);
    expect(d.profile.reduce((a, r) => a + r.ms, 0)).toBeCloseTo(d.glideMs);
    expect(d.segments.reduce((a, s) => a + s.ms, 0)).toBeCloseTo(d.glideMs);
  });
  it('every glide segment lasts ≥ 2 s; long-trip city days glide ≤ 9 s', () => {
    d.segments.forEach((s) => expect(s.ms).toBeGreaterThanOrEqual(2000));
    const long = directFlyover([dayFrom(1, cdmx)], { long: true, film: false }).days[0];
    expect(long.glideMs).toBeLessThanOrEqual(9000);
  });
  it('feature holds: 4 s + 2 s a photo on short trips, 3 s + 2 s on long', () => {
    expect(d.featureMs[2]).toBe(8000);
    expect(d.featureMs[1]).toBe(4000);
    expect(directFlyover([dayFrom(1, cdmx)], { long: true, film: false }).days[0].featureMs[2]).toBe(7000);
  });
  it('the intro is establish (+ a stop-0 feature)', () => {
    expect(d.introMs).toBe(3000 + d.featureMs[0]);
  });
});

describe('transfers (review focus 2)', () => {
  const teo = [stop('t', 'Teotihuacán', 19.6925, -98.8438), stop('u', 'Pyramid of the Moon', 19.6997, -98.8441)];
  it('a > 25 km jump between days becomes one arc with a travel label', () => {
    const plan = directFlyover([dayFrom(1, cdmx), dayFrom(2, teo)], { long: false, film: false });
    expect(plan.days[0].transfer).toBeNull();
    expect(plan.days[1].transfer?.label).toMatch(/Teotihuacán/);
    expect(plan.days[1].transfer!.ms).toBeGreaterThanOrEqual(3000);
    expect(plan.days[1].transfer!.ms).toBeLessThanOrEqual(5000);
  });
  it('a > 25 km leg inside a day is one flyTo segment of 3–5 s, not a long glide', () => {
    const p = directFlyover([dayFrom(1, [cdmx[0], teo[0]])], { long: false, film: false }).days[0];
    const fly = p.segments.filter((s) => s.move === 'flyTo');
    expect(fly).toHaveLength(1);
    expect(fly[0].ms).toBeGreaterThanOrEqual(3000);
    expect(fly[0].ms).toBeLessThanOrEqual(5000);
  });
});

describe('edge cases (review focus 1, 4)', () => {
  it('one stop, no route: establish + feature, no segments, no NaN', () => {
    const one = directFlyover([dayFrom(1, [cdmx[0]])], { long: false, film: false }).days[0];
    expect(one.segments).toEqual([]);
    expect(Number.isFinite(one.introMs)).toBe(true);
  });
  it('two stops at one spot: no zero-length segment', () => {
    const p = directFlyover([dayFrom(1, [cdmx[0], cdmx[0], cdmx[2]])], { long: false, film: false }).days[0];
    p.segments.forEach((s) => { expect(s.to).toBeGreaterThan(s.from); expect(Number.isFinite(s.ms) && s.ms > 0).toBe(true); });
  });
});

describe('film (review focus 5)', () => {
  const days = Array.from({ length: 7 }, (_, i) => dayFrom(i + 1, cdmx.map((s) => ({ ...s, id: `${s.id}${i}`, lat: s.lat + i * 0.001 }))));
  it('fits a 7-day trip in the budget', () => {
    expect(directFlyover(days, { long: true, film: true }).totalMs).toBeLessThanOrEqual(54_000);
  });
  it('a 14-day trip still ends, with finite timing', () => {
    const r = directFlyover([...days, ...days.map((d, i) => ({ ...d, dayId: `x${i}`, dayNumber: i + 8 }))], { long: true, film: true });
    expect(Number.isFinite(r.totalMs)).toBe(true);
    expect(r.totalMs).toBeGreaterThan(0);
  });
});
