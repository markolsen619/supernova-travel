import { bestInsertion, insertionCostKm, optimizeDay, routeKm, type PlaceStop } from '@/utils/routePlacement';

const s = (id: string, lat: number | null, lng: number | null, extra: Partial<PlaceStop> = {}): PlaceStop =>
  ({ id, lat, lng, type: 'activity', title: id, startTime: null, ...extra });

// Mission Beach area, roughly: west coast at lng -117.25, La Jolla north (32.85), Ocean Beach south (32.75), downtown east (-117.15).
const hotel = s('hotel', 32.790, -117.253, { type: 'hotel', title: 'Check into Catamaran' });
const laJolla = s('lajolla', 32.850, -117.273);
const tacoStand = s('taco', 32.839, -117.277, { type: 'restaurant', title: 'Lunch at The Taco Stand' });
const oceanBeach = s('ob', 32.747, -117.252, { type: 'restaurant', title: 'Dinner at South Beach' });
const museum = s('museum', 32.732, -117.150);

describe('routeKm', () => {
  it('sums legs between placed stops and skips unplaced ones', () => {
    expect(routeKm([laJolla, s('x', null, null), tacoStand])).toBeCloseTo(1.3, 0);
    expect(routeKm([])).toBe(0);
  });
});

describe('bestInsertion', () => {
  it('puts La Jolla Cove next to the Taco Stand, not after Ocean Beach (the owner\'s Day 2)', () => {
    const day = [s('torrey', 32.921, -117.251), museum, tacoStand, oceanBeach];
    const cove = s('cove', 32.850, -117.273);
    // Next to the Taco Stand (index 2 = just before it, 3 = just after), never after Ocean Beach.
    expect([2, 3]).toContain(bestInsertion(day, cove));
  });
  it('never inserts before a first-of-day hotel or after a last-of-day hotel', () => {
    const checkout = s('out', 32.790, -117.253, { type: 'hotel', title: 'Check out of Catamaran' });
    const near = s('near', 32.7905, -117.2535);
    expect(bestInsertion([hotel, laJolla], near)).toBeGreaterThanOrEqual(1);
    expect(bestInsertion([laJolla, checkout], near)).toBeLessThanOrEqual(1);
  });
  it('keeps dinner after lunch and after the day\'s sights', () => {
    const dinner = s('dinner', 32.851, -117.272, { type: 'restaurant', title: 'Dinner at George\'s' });
    const day = [laJolla, tacoStand, museum];
    expect(bestInsertion(day, dinner)).toBe(3);
  });
  it('respects timed stops: a 13:00 stop goes after an 11:00 one and before a 19:00 one', () => {
    const day = [s('a', 32.85, -117.27, { startTime: '11:00' }), s('b', 32.73, -117.15, { startTime: '19:00' })];
    expect(bestInsertion(day, s('n', 32.73, -117.15, { startTime: '13:00' }))).toBe(1);
  });
  it('an unplaced new stop goes at the end (before a closing hotel)', () => {
    expect(bestInsertion([laJolla, museum], s('n', null, null))).toBe(2);
  });
  it('unplaced only: returns the end and never throws', () => {
    expect(bestInsertion([s('a', null, null), s('b', null, null)], s('c', null, null))).toBe(2);
  });
  it('insertionCostKm is 0 for an empty day', () => {
    expect(insertionCostKm([], laJolla, 0)).toBe(0);
  });
});

describe('optimizeDay', () => {
  it('fixes the zig-zag: La Jolla stops together, Ocean Beach last', () => {
    const day = [s('torrey', 32.921, -117.251), museum, tacoStand, oceanBeach, laJolla];
    const ids = optimizeDay(day).map((x) => x.id);
    expect(Math.abs(ids.indexOf('taco') - ids.indexOf('lajolla'))).toBe(1);
    expect(routeKm(optimizeDay(day))).toBeLessThan(routeKm(day));
  });
  it('keeps a first hotel first, a last hotel last, and fixed/timed stops in their slots', () => {
    const day = [hotel, museum, s('t', 32.85, -117.27, { startTime: '12:00' }), laJolla, s('h2', 32.79, -117.25, { type: 'hotel', title: 'Check out' })];
    const out = optimizeDay(day).map((x) => x.id);
    expect(out[0]).toBe('hotel');
    expect(out[out.length - 1]).toBe('h2');
    expect(out.indexOf('t')).toBe(2);
  });
  it('leaves unplaced stops where they were', () => {
    const day = [museum, s('u', null, null), laJolla, tacoStand];
    expect(optimizeDay(day)[1].id).toBe('u');
  });
  it('unplaced only: same order', () => {
    const day = [s('a', null, null), s('b', null, null)];
    expect(optimizeDay(day).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('handles more than 8 movable stops (heuristic) without losing any', () => {
    const many = Array.from({ length: 11 }, (_, i) => s(`m${i}`, 32.7 + ((i * 7) % 11) / 50, -117.2 - ((i * 3) % 11) / 50));
    const out = optimizeDay(many);
    expect(new Set(out.map((x) => x.id)).size).toBe(11);
    expect(routeKm(out)).toBeLessThanOrEqual(routeKm(many));
  });
});
