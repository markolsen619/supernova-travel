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
