import { isCurrentEntry, spreadCluster } from '@/utils/friendsTraveling';

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
