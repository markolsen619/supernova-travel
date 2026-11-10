import { isTikTokHost, tiktokVideoId, isShortTikTok, trimCaption, parsePlacesAnswer, cleanPlaces, wishQuota, monthKey, pickByName } from '../../functions/src/socialPost';

describe('TikTok links', () => {
  it('knows TikTok hosts and nothing else', () => {
    for (const h of ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']) expect(isTikTokHost(h)).toBe(true);
    for (const h of ['tiktok.com.evil.io', 'nottiktok.com', 'instagram.com']) expect(isTikTokHost(h)).toBe(false);
  });
  it('reads the video id from a full link', () => {
    expect(tiktokVideoId('https://www.tiktok.com/@foodie_tokyo/video/7300000000000000001?is_from_webapp=1')).toBe('7300000000000000001');
    expect(tiktokVideoId('https://m.tiktok.com/v/7300000000000000002.html')).toBe('7300000000000000002');
    expect(tiktokVideoId('https://vm.tiktok.com/ZM8xAbc/')).toBeNull();
    expect(tiktokVideoId('https://evil.io/@x/video/123')).toBeNull();
  });
  it('spots short links that must be followed first', () => {
    expect(isShortTikTok('https://vm.tiktok.com/ZM8xAbc/')).toBe(true);
    expect(isShortTikTok('https://www.tiktok.com/t/ZT8abc/')).toBe(true);
    expect(isShortTikTok('https://www.tiktok.com/@a/video/1')).toBe(false);
  });
  it('trims captions', () => {
    expect(trimCaption('  best   ramen\n\nin Tokyo ')).toBe('best ramen in Tokyo');
    expect(trimCaption('x'.repeat(400))).toHaveLength(300);
    expect(trimCaption(null)).toBe('');
  });
});

describe('the AI answer', () => {
  it('keeps each place with its own city (a Tokyo video naming a Kyoto spot)', () => {
    const a = parsePlacesAnswer(JSON.stringify({ city: 'Tokyo', country: 'Japan', places: [
      { name: 'Ichiran Shibuya', kind: 'restaurant', city: 'Tokyo' }, { name: 'Gion Kappa', kind: 'bar', city: 'Kyoto' },
    ] }));
    expect(a?.places.map((p) => [p.name, p.city])).toEqual([['Ichiran Shibuya', 'Tokyo'], ['Gion Kappa', 'Kyoto']]);
  });
  it('maps an unknown kind to other and rejects garbage', () => {
    expect(parsePlacesAnswer(JSON.stringify({ city: null, country: null, places: [{ name: 'X', kind: 'spaceport', city: null }] }))?.places[0].kind).toBe('other');
    expect(parsePlacesAnswer('not json')).toBeNull();
    expect(parsePlacesAnswer(JSON.stringify({ places: 'nope' }))).toBeNull();
  });
  it('cleanPlaces drops empties, duplicates and the city or country itself, and keeps at most 10', () => {
    const a = cleanPlaces({ city: 'Tokyo', country: 'Japan', places: [
      { name: '  ', kind: 'other', city: null }, { name: 'Tokyo', kind: 'sight', city: 'Tokyo' }, { name: 'japan', kind: 'sight', city: null },
      { name: 'Café Kitsuné', kind: 'cafe', city: 'Tokyo' }, { name: 'cafe kitsune', kind: 'cafe', city: 'Tokyo' },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Spot ${i}`, kind: 'sight' as const, city: 'Tokyo' })),
    ] });
    expect(a.places[0].name).toBe('Café Kitsuné');
    expect(a.places.filter((p) => /kitsun/i.test(p.name))).toHaveLength(1);
    expect(a.places.some((p) => /^(tokyo|japan)$/i.test(p.name))).toBe(false);
    expect(a.places).toHaveLength(10);
  });
});

describe('wishQuota', () => {
  const now = Date.parse('2026-11-06T10:15:00Z');
  const full = { videos: Array.from({ length: 20 }, (_, i) => `v${i}`) };
  it('a new video counts; the same video again is free', () => {
    const first = wishQuota({}, 'v1', false, now);
    expect(first).toMatchObject({ ok: true, counted: true });
    const again = wishQuota((first as { patch: object }).patch, 'v1', false, now);
    expect(again).toMatchObject({ ok: true, counted: false });
  });
  it('free accounts stop at 20 new videos a month; Pro does not', () => {
    expect(wishQuota(full, 'new', false, now)).toEqual({ ok: false, reason: 'monthly' });
    expect(wishQuota(full, 'v3', false, now)).toMatchObject({ ok: true, counted: false });
    expect(wishQuota(full, 'new', true, now)).toMatchObject({ ok: true, counted: true });
  });
  it('everyone stops at 30 new videos an hour', () => {
    expect(wishQuota({ hours: { '2026-11-06T10': 30 } }, 'new', true, now)).toEqual({ ok: false, reason: 'hourly' });
  });
  it('months are UTC', () => { expect(monthKey(Date.parse('2026-12-01T00:30:00Z'))).toBe('2026-12'); });
});

describe('pickByName', () => {
  const center = { lat: 35.68, lng: 139.76 };
  it('takes the result named like the place, near the city', () => {
    expect(pickByName('Ichiran Shibuya', [
      { name: 'Shibuya Station', lat: 35.658, lng: 139.701 }, { name: 'Ichiran Shibuya', lat: 35.661, lng: 139.700 },
    ], center)).toEqual({ lat: 35.661, lng: 139.700 });
  });
  it('rejects a namesake far away and a result sharing no word', () => {
    expect(pickByName('Ichiran', [{ name: 'Ichiran Fukuoka', lat: 33.59, lng: 130.4 }], center)).toBeNull();
    expect(pickByName('Gion Kappa', [{ name: 'Tokyo Tower', lat: 35.65, lng: 139.74 }], center)).toBeNull();
  });
});

import { shouldCachePost } from '../../functions/src/socialPost';
describe('shouldCachePost (final review: a failed read was cached for 30 days, for everyone)', () => {
  it('caches only a real read: oEmbed answered and the AI did not fail', () => {
    expect(shouldCachePost({ oembedStatus: 200, aiFailed: false })).toBe(true);
    expect(shouldCachePost({ oembedStatus: 0, aiFailed: false })).toBe(false);
    expect(shouldCachePost({ oembedStatus: 429, aiFailed: false })).toBe(false);
    expect(shouldCachePost({ oembedStatus: 503, aiFailed: false })).toBe(false);
    expect(shouldCachePost({ oembedStatus: 200, aiFailed: true })).toBe(false);
  });
});

import { postMeta } from '../../functions/src/socialPost';
describe('postMeta (device test 2026-11-08: TikTok\'s lookup came back empty from the server)', () => {
  const hint = { caption: 'Best ramen in Tokyo at Ichiran Shibuya', author: 'Foodie', authorHandle: 'foodie_tokyo', coverUrl: 'https://p16.tiktokcdn.com/x.jpg' };
  it('uses the server\'s own lookup when it worked', () => {
    const m = postMeta(200, { title: 'Server caption', author_name: 'S', author_unique_id: 's', thumbnail_url: 'https://p16.tiktokcdn.com/s.jpg' }, hint);
    expect(m).toMatchObject({ caption: 'Server caption', authorHandle: 's', fromDevice: false });
  });
  it('falls back to what the phone read when the server got nothing', () => {
    for (const status of [0, 403, 429, 500]) expect(postMeta(status, null, hint)).toMatchObject({ caption: hint.caption, authorHandle: 'foodie_tokyo', fromDevice: true });
  });
  it('cleans what the phone sent (length, https covers only)', () => {
    const m = postMeta(0, null, { caption: 'x'.repeat(900), author: 'a'.repeat(300), authorHandle: 'h', coverUrl: 'http://evil/x.jpg' });
    expect(m.caption).toHaveLength(300); expect(m.author.length).toBeLessThanOrEqual(80); expect(m.coverUrl).toBeNull();
  });
  it('no lookup and no hint: empty, not from the device', () => {
    expect(postMeta(0, null, null)).toMatchObject({ caption: '', fromDevice: false });
  });
  it('never caches a read that used the phone\'s words (no planting places for others)', () => {
    expect(shouldCachePost({ oembedStatus: 0, aiFailed: false, fromDevice: true })).toBe(false);
    expect(shouldCachePost({ oembedStatus: 200, aiFailed: false, fromDevice: false })).toBe(true);
  });
});

import { chooseVideoId } from '../../functions/src/socialPost';
describe('chooseVideoId (device test 2026-11-09: short links resolved from Google\'s servers lost the video id)', () => {
  it('the server\'s own resolution first', () => {
    expect(chooseVideoId('https://www.tiktok.com/@a/video/7300000000000000001', null)).toBe('7300000000000000001');
  });
  it('then the link the phone resolved, only on a TikTok host', () => {
    expect(chooseVideoId('https://www.tiktok.com/login', { resolvedUrl: 'https://www.tiktok.com/@a/video/7300000000000000002?x=1' })).toBe('7300000000000000002');
    expect(chooseVideoId('https://www.tiktok.com/login', { resolvedUrl: 'https://evil.io/@a/video/7300000000000000003' })).toBeNull();
  });
  it('then the id TikTok\'s lookup gave the phone (digits only)', () => {
    expect(chooseVideoId('https://www.tiktok.com/', { videoId: '7300000000000000004' })).toBe('7300000000000000004');
    expect(chooseVideoId('https://www.tiktok.com/', { videoId: '../../x' })).toBeNull();
    expect(chooseVideoId('https://www.tiktok.com/', null)).toBeNull();
  });
});

import { oembedTarget, parseEmbedPage } from '../../functions/src/socialPost';
const embedHtml = (videoData: unknown, id = '7666811080135445782') =>
  `<html><script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify({ source: { data: { [`/embed/v2/${id}`]: { videoData } } } })}</script></html>`;
const photoVideoData = {
  itemInfos: { id: '7666811080135445782', text: 'A quick snap shot guide to Budapest Christmas Markets for 2026', covers: ['https://p16-common-sign.tiktokcdn-us.com/photomode/cover.jpeg?x-expires=1'] },
  authorInfos: { uniqueId: 'gigsntravel', nickName: 'Lauren | gigs & travel' },
};

describe('TikTok photo posts (device test 2026-11-09: a slideshow link landed on /photo/ and was refused)', () => {
  it('reads the id from a /photo/ link', () => {
    expect(tiktokVideoId('https://www.tiktok.com/@gigsntravel/photo/7666811080135445782')).toBe('7666811080135445782');
    expect(tiktokVideoId('https://evil.io/@x/photo/7666811080135445782')).toBeNull();
  });
  it('asks oEmbed with the /video/ form, which TikTok accepts for photo posts (a /photo/ link is a 400)', () => {
    expect(oembedTarget('https://www.tiktok.com/@gigsntravel/photo/7666811080135445782?_r=1')).toBe('https://www.tiktok.com/@gigsntravel/video/7666811080135445782?_r=1');
    expect(oembedTarget('https://www.tiktok.com/@a/video/7300000000000000001')).toBe('https://www.tiktok.com/@a/video/7300000000000000001');
  });
  it('reads caption, creator and cover from the embed page, which has them when oEmbed has none', () => {
    expect(parseEmbedPage(embedHtml(photoVideoData))).toEqual({
      caption: 'A quick snap shot guide to Budapest Christmas Markets for 2026', author: 'Lauren | gigs & travel', authorHandle: 'gigsntravel',
      coverUrl: 'https://p16-common-sign.tiktokcdn-us.com/photomode/cover.jpeg?x-expires=1',
    });
  });
  it('gives null for a page without the post, broken JSON or a non-https cover', () => {
    expect(parseEmbedPage('<html>blocked</html>')).toBeNull();
    expect(parseEmbedPage('<script id="__FRONTITY_CONNECT_STATE__" type="application/json">{nope</script>')).toBeNull();
    expect(parseEmbedPage(embedHtml({ itemInfos: { text: 'x', covers: ['http://evil/x.jpg'] }, authorInfos: {} }))?.coverUrl).toBeNull();
  });
});

describe('postMeta falls through to the embed page and then the phone when oEmbed answers without a caption', () => {
  const embed = { caption: 'Embed caption', author: 'E', authorHandle: 'e', coverUrl: 'https://p16.tiktokcdn.com/e.jpg' };
  it('uses the embed page (from TikTok, so cacheable) when oEmbed is 200 but empty', () => {
    expect(postMeta(200, { type: 'video', embed_product_id: '1' }, { caption: 'Phone' }, embed)).toEqual({ ...embed, fromDevice: false });
  });
  it('uses the phone when neither server read has a caption', () => {
    expect(postMeta(200, { type: 'video' }, { caption: 'Phone caption', authorHandle: 'p' }, null)).toMatchObject({ caption: 'Phone caption', authorHandle: 'p', fromDevice: true });
  });
  it('keeps the oEmbed caption first when there is one', () => {
    expect(postMeta(200, { title: 'OE' }, { caption: 'Phone' }, embed).caption).toBe('OE');
  });
});

describe('shouldCachePost never caches a read with no caption (it would say "no places" for 30 days)', () => {
  it('refuses an empty caption', () => {
    expect(shouldCachePost({ oembedStatus: 200, aiFailed: false, hasCaption: false })).toBe(false);
    expect(shouldCachePost({ oembedStatus: 200, aiFailed: false, hasCaption: true })).toBe(true);
  });
});
