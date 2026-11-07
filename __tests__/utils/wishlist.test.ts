import { tiktokUrlFromShare, wishMatches, fitsTrip, kindToActivityType, wishlistByCity, wishlistDoc, type WishSave, type TripForMatch } from '@/utils/wishlist';

const place = (id: string, name: string, lat: number | null, lng: number | null, city = 'Tokyo') => ({ id, name, kind: 'restaurant' as const, city, countryCode: 'JP', lat, lng });
const save = (videoId: string, places: ReturnType<typeof place>[], city: string | null = 'Tokyo', savedAtMs = 1): WishSave => ({
  videoId, platform: 'tiktok', postUrl: `https://www.tiktok.com/@a/video/${videoId}`, author: 'A', authorHandle: 'a', caption: '', city, country: 'Japan', cityLat: 35.68, cityLng: 139.76, savedAtMs, places,
});
const tokyo: TripForMatch = { id: 't', title: 'Tokyo trip', start: '2026-12-01', end: '2026-12-07', cities: [{ name: 'Tokyo', lat: 35.68, lng: 139.76 }] };
const kyoto: TripForMatch = { id: 'k', title: 'Kyoto trip', start: '2026-12-08', end: '2026-12-10', cities: [{ name: 'Kyoto', lat: 35.01, lng: 135.77 }] };

describe('tiktokUrlFromShare', () => {
  it('finds the link among other words', () => {
    expect(tiktokUrlFromShare('Check this out https://vm.tiktok.com/ZM8xAbc/ #tokyo')).toBe('https://vm.tiktok.com/ZM8xAbc/');
    expect(tiktokUrlFromShare('https://www.tiktok.com/@foodie/video/7300000000000000001?_r=1')).toBe('https://www.tiktok.com/@foodie/video/7300000000000000001?_r=1');
  });
  it('ignores other sites and look-alikes', () => {
    expect(tiktokUrlFromShare('https://www.instagram.com/reel/abc/')).toBeNull();
    expect(tiktokUrlFromShare('https://tiktok.com.evil.io/x')).toBeNull();
    expect(tiktokUrlFromShare('no link here')).toBeNull();
  });
});

describe('matching trips by distance', () => {
  const shibuya = place('p1', 'Ichiran Shibuya', 35.66, 139.70);
  const gion = place('p2', 'Gion Kappa', 35.0037, 135.7788, 'Kyoto');
  const s = save('v1', [shibuya, gion]);
  it('a place within 50 km of a trip city matches it (Shibuya → Tokyo), another city\'s place does not', () => {
    expect(wishMatches(tokyo, [s], '2026-11-06').map((m) => m.place.name)).toEqual(['Ichiran Shibuya']);
    expect(wishMatches(kyoto, [s], '2026-11-06').map((m) => m.place.name)).toEqual(['Gion Kappa']);
  });
  it('an ended trip matches nothing; a current one does', () => {
    expect(wishMatches(tokyo, [s], '2026-12-08')).toEqual([]);
    expect(wishMatches(tokyo, [s], '2026-12-03')).toHaveLength(1);
  });
  it('places without a position never match', () => {
    expect(wishMatches(tokyo, [save('v2', [place('p3', 'Somewhere', null, null)])], '2026-11-06')).toEqual([]);
  });
  it('fitsTrip names the nearest upcoming trip', () => {
    expect(fitsTrip(gion, [tokyo, kyoto], '2026-11-06')?.id).toBe('k');
    expect(fitsTrip({ lat: 48.85, lng: 2.35 }, [tokyo, kyoto], '2026-11-06')).toBeNull();
  });
});

it('kindToActivityType', () => {
  expect(['restaurant', 'bar', 'cafe'].map((k) => kindToActivityType(k as never))).toEqual(['restaurant', 'restaurant', 'restaurant']);
  expect(kindToActivityType('hotel')).toBe('hotel');
  expect(kindToActivityType('sight')).toBe('activity');
});

it('wishlistByCity groups by place city, newest save first, posts without places under their city or Somewhere', () => {
  const g = wishlistByCity([
    save('old', [place('a', 'Old spot', 35.6, 139.7)], 'Tokyo', 1),
    save('new', [place('b', 'Gion Kappa', 35.0, 135.7, 'Kyoto')], 'Tokyo', 3),
    save('none', [], null, 2),
  ]);
  expect(g.map((x) => x.city)).toEqual(['Kyoto', 'Somewhere', 'Tokyo']);
  expect(g[1].places[0].place).toBeNull();
});

it('wishlistDoc keeps the ticked places plus ones added by name', () => {
  const s = save('v', [place('p1', 'A', 1, 1), place('p2', 'B', 2, 2)]);
  const d = wishlistDoc(s, ['p2'], [place('x1', 'Typed', 3, 3)]);
  expect(d.places.map((p) => p.name)).toEqual(['B', 'Typed']);
  expect(d).not.toHaveProperty('savedAtMs');
});

import { toTripForMatch } from '@/utils/wishlist';
it('toTripForMatch: calendar dates and every city with a position', () => {
  const t = toTripForMatch({
    id: 't1', title: 'Japan', startDay: '2026-12-01', startDate: null, endDate: { toDate: () => new Date('2026-12-10T12:00:00') },
    destination: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, additionalDestinations: [{ name: 'Kyoto', lat: 35.01, lng: 135.77 }, { name: 'Somewhere', lat: null, lng: null }],
  } as never);
  expect(t).toEqual({ id: 't1', title: 'Japan', start: '2026-12-01', end: '2026-12-10', cities: [
    { name: 'Tokyo', lat: 35.68, lng: 139.76 }, { name: 'Kyoto', lat: 35.01, lng: 135.77 }, { name: 'Somewhere', lat: null, lng: null },
  ] });
});
