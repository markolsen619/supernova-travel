import { friendStacks, isCurrentEntry, spreadCluster } from '@/utils/friendsTraveling';

describe('isCurrentEntry', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  it('keeps only today', () => {
    expect(isCurrentEntry({ day: '2026-11-22' }, now)).toBe(true);
    expect(isCurrentEntry({ day: '2026-11-21' }, now)).toBe(false);
    expect(isCurrentEntry({}, now)).toBe(false);
  });
});

describe('spreadCluster', () => {
  const a = { uid: 'a', lat: 50, lng: 14 };
  it('leaves a lone traveller exactly on the city', () => {
    expect(spreadCluster([a], 4)).toEqual([a]);
  });
  it('spreads travellers in one city to distinct, stable spots', () => {
    const b = { uid: 'b', lat: 50, lng: 14 };
    const out = spreadCluster([b, a], 4);
    expect(new Set(out.map((o) => `${o.lat},${o.lng}`)).size).toBe(2);
    expect(spreadCluster([a, b], 4)).toEqual(spreadCluster([b, a], 4).sort((x, y) => x.uid.localeCompare(y.uid)));
  });
  it('spreads less as the map zooms in', () => {
    const b = { uid: 'b', lat: 50, lng: 14 };
    const far = spreadCluster([a, b], 3).find((o) => o.uid === 'a')!;
    const near = spreadCluster([a, b], 10).find((o) => o.uid === 'a')!;
    expect(Math.abs(near.lng - 14)).toBeLessThan(Math.abs(far.lng - 14));
  });
});

describe('friendStacks (spec 2026-11-11; review focus 2)', () => {
  const f = (uid: string, lat: number, lng: number) => ({ uid, lat, lng });
  it('one friend stays a single marker', () => {
    expect(friendStacks([f('a', 48.85, 2.35)], 1)).toEqual({ stacks: [], singles: [f('a', 48.85, 2.35)] });
  });
  it('friends close together at world view become one stack of ≤ 3 faces + extra', () => {
    const r = friendStacks([f('d', 48.85, 2.35), f('a', 50.85, 4.35), f('c', 52.37, 4.9), f('b', 51.5, -0.12)], 1);
    expect(r.singles).toEqual([]);
    expect(r.stacks).toHaveLength(1);
    expect(r.stacks[0].faces.map((x) => x.uid)).toEqual(['a', 'b', 'c']);
    expect(r.stacks[0].extra).toBe(1);
  });
  it('friends at the exact same spot become one stack', () => {
    const r = friendStacks([f('a', 35.68, 139.69), f('b', 35.68, 139.69)], 2);
    expect(r.stacks).toHaveLength(1);
    expect(r.stacks[0].extra).toBe(0);
  });
  it('friends far apart stay separate', () => {
    const r = friendStacks([f('a', 48.85, 2.35), f('b', 35.68, 139.69)], 1);
    expect(r.stacks).toEqual([]);
    expect(r.singles).toHaveLength(2);
  });
  it('from zoom 4 it defers to spreadCluster (no stacks)', () => {
    const r = friendStacks([f('a', 48.85, 2.35), f('b', 48.85, 2.35)], 5);
    expect(r.stacks).toEqual([]);
    expect(r.singles).toHaveLength(2);
    expect(r.singles[0].lng).not.toBe(r.singles[1].lng);
  });
});
