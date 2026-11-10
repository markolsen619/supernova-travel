import { tiktokUrlFromShare, wishMatches, fitsTrip, kindToActivityType, wishlistByCity, wishlistDoc, type WishSave, type TripForMatch } from '@/utils/wishlist';

const place = (id: string, name: string, lat: number | null, lng: number | null, city = 'Tokyo') => ({ id, name, kind: 'restaurant' as const, city, countryCode: 'JP', lat, lng });
const save = (videoId: string, places: WishSave['places'], city: string | null = 'Tokyo', savedAtMs = 1): WishSave => ({
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

import { wishActivity } from '@/utils/wishlist';
it('wishActivity: a normal stop of the right type, on the map, with a search text the grounding pass can improve', () => {
  const s = save('v', [], 'Tokyo');
  const a = wishActivity({ id: 'p', name: 'Gion Kappa', kind: 'bar', city: 'Kyoto', countryCode: 'JP', lat: 35.0, lng: 135.7 }, s);
  expect(a).toMatchObject({ type: 'restaurant', title: 'Gion Kappa', titleSource: 'user', placeName: 'Gion Kappa', lat: 35.0, lng: 135.7, searchQuery: 'Gion Kappa, Kyoto', placeId: null, startTime: null, visited: false });
  expect(Object.values(a).some((v) => v === undefined)).toBe(false);
  expect(wishActivity({ id: 'q', name: 'Spot', kind: 'sight', city: null, countryCode: null, lat: null, lng: null }, save('w', [], null)).searchQuery).toBe('Spot');
});

import { afterLimitPaywall, mergeReshare, singleFlight } from '@/utils/wishlist';
describe('final review fixes', () => {
  it('afterLimitPaywall: retry only once the account is paid; a cancel stops (it looped forever)', () => {
    expect(afterLimitPaywall('pro')).toBe('retry');
    expect(afterLimitPaywall('business')).toBe('retry');
    expect(afterLimitPaywall('free')).toBe('stop');
    expect(afterLimitPaywall(null)).toBe('stop');
  });
  it('mergeReshare keeps "on a trip" marks when the same video is saved again', () => {
    const before = save('v', [{ ...place('p1', 'Ichiran', 35.6, 139.7), addedTo: { tripId: 't', dayId: 'd', activityId: 'a' } }]);
    const again = save('v', [place('p1', 'Ichiran', 35.6, 139.7), place('p2', 'New spot', 35.6, 139.7)]);
    const m = mergeReshare(before, again);
    expect(m.places.find((p) => p.name === 'Ichiran')?.addedTo).toEqual({ tripId: 't', dayId: 'd', activityId: 'a' });
    expect(m.places.find((p) => p.name === 'New spot')).not.toHaveProperty('addedTo');
    expect(mergeReshare(null, again)).toBe(again);
  });
  it('singleFlight ignores a second call while the first is running (a double tap added two stops)', async () => {
    let calls = 0;
    let release!: () => void;
    const f = singleFlight(() => { calls++; return new Promise<void>((r) => { release = r; }); });
    const a = f(); f(); f();
    expect(calls).toBe(1);
    release(); await a;
    f();
    expect(calls).toBe(2);
  });
});

import { parseOembed, isDuplicateShare } from '@/utils/wishlist';
describe('device lookup and one sheet per share', () => {
  it('parseOembed reads caption, creator and an https cover', () => {
    expect(parseOembed({ title: ' Ramen ', author_name: 'Foodie', author_unique_id: 'foodie', thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg' }))
      .toEqual({ caption: 'Ramen', author: 'Foodie', authorHandle: 'foodie', coverUrl: 'https://p16.tiktokcdn.com/x.jpg', videoId: null });
    expect(parseOembed({ thumbnail_url: 'http://x' })).toEqual({ caption: '', author: '', authorHandle: '', coverUrl: null, videoId: null });
    expect(parseOembed(null)).toBeNull();
  });
  it('isDuplicateShare: the same link within 10 s opens once', () => {
    expect(isDuplicateShare({ url: 'u', at: 1000 }, 'u', 5000)).toBe(true);
    expect(isDuplicateShare({ url: 'u', at: 1000 }, 'u', 12_000)).toBe(false);
    expect(isDuplicateShare({ url: 'u', at: 1000 }, 'v', 2000)).toBe(false);
    expect(isDuplicateShare(null, 'u', 2000)).toBe(false);
  });
});

import { savesNear, mustSeeWith, topSavedCity } from '@/utils/wishlist';
describe('saved places when planning (owner, 2026-11-08)', () => {
  const tokyoSave = save('t', [place('a', 'Ichiran Shibuya', 35.66, 139.7), { ...place('b', 'Already planned', 35.67, 139.7), addedTo: { tripId: 'x', dayId: 'd', activityId: 'y' } }, place('c', 'No position', null, null)], 'Tokyo', 2);
  const kyotoSave = save('k', [place('g', 'Gion Kappa', 35.0, 135.77, 'Kyoto')], 'Kyoto', 1);
  it('savesNear: saved places within 50 km of the city, not yet on a trip, with a position', () => {
    expect(savesNear({ lat: 35.68, lng: 139.76 }, [tokyoSave, kyotoSave]).map((m) => m.place.name)).toEqual(['Ichiran Shibuya']);
    expect(savesNear(null, [tokyoSave])).toEqual([]);
  });
  it('mustSeeWith adds names once, comma-separated', () => {
    expect(mustSeeWith('', ['Ichiran Shibuya', 'Gion Kappa'])).toBe('Ichiran Shibuya, Gion Kappa');
    expect(mustSeeWith('teamLab, ichiran shibuya', ['Ichiran Shibuya', 'Gion Kappa'])).toBe('teamLab, ichiran shibuya, Gion Kappa');
  });
  it('topSavedCity: the city with the most saved places not yet on a trip', () => {
    const extra = save('t2', [place('d', 'Tsukiji', 35.66, 139.77)], 'Tokyo', 3);
    expect(topSavedCity([tokyoSave, kyotoSave, extra])).toMatchObject({ city: 'Tokyo', count: 2, names: ['Tsukiji', 'Ichiran Shibuya'] });
    expect(topSavedCity([])).toBeNull();
  });
});

it('parseOembed also reads the video id (embed_product_id) for the server', () => {
  expect(parseOembed({ title: 'x', embed_product_id: '7300000000000000009' })?.videoId).toBe('7300000000000000009');
  expect(parseOembed({ title: 'x' })?.videoId).toBeNull();
});

import { embedMetaFromHtml, oembedLink, tiktokPostId } from '@/utils/wishlist';
describe('photo posts on the phone (device test 2026-11-09: a TikTok slideshow could not be saved)', () => {
  const html = `<script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify({ source: { data: { '/embed/v2/7666811080135445782': { videoData: {
    itemInfos: { text: ' Budapest Christmas Markets guide ', covers: ['https://p16-common-sign.tiktokcdn-us.com/c.jpeg?x=1'] },
    authorInfos: { uniqueId: 'gigsntravel', nickName: 'Lauren' },
  } } } } })}</script>`;
  it('finds the post id in /video/ and /photo/ links, TikTok hosts only', () => {
    expect(tiktokPostId('https://www.tiktok.com/@gigsntravel/photo/7666811080135445782?_r=1')).toBe('7666811080135445782');
    expect(tiktokPostId('https://www.tiktok.com/@a/video/7300000000000000001')).toBe('7300000000000000001');
    expect(tiktokPostId('https://vm.tiktok.com/ZM8xAbc/')).toBeNull();
    expect(tiktokPostId('https://evil.io/@a/photo/7666811080135445782')).toBeNull();
  });
  it('gives oEmbed the /video/ form of a photo link', () => {
    expect(oembedLink('https://www.tiktok.com/@g/photo/7666811080135445782')).toBe('https://www.tiktok.com/@g/video/7666811080135445782');
  });
  it('reads the embed page in the same shape as parseOembed', () => {
    expect(embedMetaFromHtml(html, '7666811080135445782')).toEqual({
      caption: 'Budapest Christmas Markets guide', author: 'Lauren', authorHandle: 'gigsntravel',
      coverUrl: 'https://p16-common-sign.tiktokcdn-us.com/c.jpeg?x=1', videoId: '7666811080135445782',
    });
    expect(embedMetaFromHtml('<html></html>', '1')).toBeNull();
  });
});

import { wishByCity } from '@/utils/wishlist';
describe('wishByCity — saved places shown under the trip city they belong to (owner 2026-11-09: the chip was missed)', () => {
  const trip = { id: 't1', title: 'Prague, Budapest, Vienna', start: '2026-11-18', end: '2026-12-05', cities: [
    { name: 'Prague', lat: 50.0755, lng: 14.4378 }, { name: 'Budapest', lat: 47.4979, lng: 19.0402 }, { name: 'Vienna', lat: 48.2082, lng: 16.3738 }, { name: 'Nowhere', lat: null, lng: null },
  ] };
  const save = (id: string, places: Partial<import('@/utils/wishlist').WishPlace>[]) =>
    ({ videoId: id, platform: 'tiktok', postUrl: '', author: '', authorHandle: 'h', caption: '', city: null, country: null, cityLat: null, cityLng: null, savedAtMs: 0,
      places: places.map((p, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'sight', city: null, countryCode: null, lat: null, lng: null, ...p })) }) as import('@/utils/wishlist').WishSave;
  it('puts each place under its nearest city, in the trip\'s city order', () => {
    const s = save('v1', [{ name: 'Christmas markets', lat: 47.5468, lng: 19.0717 }, { name: 'Prague Castle', lat: 50.0909, lng: 14.4005 }]);
    const by = wishByCity(trip, [{ save: s, place: s.places[0] }, { save: s, place: s.places[1] }]);
    expect(by.map((list) => list.map((m) => m.place.name))).toEqual([['Prague Castle'], ['Christmas markets'], [], []]);
  });
  it('leaves out places already on this trip (the card invites; the stop is already there)', () => {
    const s = save('v1', [{ lat: 47.5468, lng: 19.0717, addedTo: { tripId: 't1', dayId: 'd', activityId: 'a' } as never }]);
    expect(wishByCity(trip, [{ save: s, place: s.places[0] }])[1]).toEqual([]);
  });
});

import { savesInCity, wishCardEyebrow, wishCityChips } from '@/utils/wishlist';
describe('wish list grid rules (spec 2026-11-10 §1)', () => {
  const mk = (id: string, city: string | null, places: { city: string | null; addedTo?: boolean }[], savedAtMs = 0) => ({
    videoId: id, platform: 'tiktok' as const, postUrl: '', author: 'A', authorHandle: 'a', caption: '', city, country: null, cityLat: null, cityLng: null, savedAtMs,
    places: places.map((p, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'sight' as const, city: p.city, countryCode: null, lat: null, lng: null, ...(p.addedTo ? { addedTo: { tripId: 't', dayId: 'd', activityId: 'x' } } : {}) })),
  });
  const saves = [
    mk('1', 'Budapest', [{ city: 'Budapest' }]),
    mk('2', 'Lisbon', [{ city: 'Lisbon' }, { city: 'Sintra' }]),
    mk('3', 'Lisbon', [{ city: 'Lisbon' }]),
    mk('4', null, []),
  ];
  it('counts each post once per city it touches, most saved first, then by name', () => {
    expect(wishCityChips(saves)).toEqual([{ city: 'Lisbon', count: 2 }, { city: 'Budapest', count: 1 }, { city: 'Sintra', count: 1 }]);
  });
  it('filters to posts touching the city; null is everything', () => {
    expect(savesInCity(saves, 'Sintra').map((s) => s.videoId)).toEqual(['2']);
    expect(savesInCity(saves, null)).toHaveLength(4);
  });
  it('builds the card eyebrow', () => {
    expect(wishCardEyebrow(saves[0])).toBe('BUDAPEST · 1 PLACE');
    expect(wishCardEyebrow(saves[1])).toBe('LISBON · 2 PLACES');
    expect(wishCardEyebrow(saves[3])).toBe('TIKTOK');
  });
});
