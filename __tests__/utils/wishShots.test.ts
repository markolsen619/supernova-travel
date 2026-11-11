import { encodePendingShare, newShotSaveId, parsePendingShare, screenshotSaveDoc, shareKind } from '@/utils/wishShots';

const read = { city: 'Tokyo', country: 'Japan', cityLat: 35.68, cityLng: 139.69, places: [
  { id: 'p0', name: 'Ichiran Shibuya', kind: 'restaurant' as const, city: 'Tokyo', countryCode: 'JP', lat: 35.66, lng: 139.7 },
  { id: 'p1', name: 'Shibuya Sky', kind: 'sight' as const, city: 'Tokyo', countryCode: 'JP', lat: 35.658, lng: 139.702 },
] };
const SID = 'sAbCdEfGhIjKlMnOpQrSt';

describe('screenshotSaveDoc', () => {
  it('builds the screenshot save shape, keeping the ticked places', () => {
    const doc = screenshotSaveDoc('u1', SID, read, ['p1'], [], [`wish_shots/u1/${SID}/0.jpg`]);
    expect(doc).toEqual({
      platform: 'screenshot', videoId: SID, postUrl: '', author: '', authorHandle: '', caption: '',
      city: 'Tokyo', country: 'Japan', cityLat: 35.68, cityLng: 139.69, places: [read.places[1]], shots: [`wish_shots/u1/${SID}/0.jpg`],
    });
  });
  it('refuses shots outside the user\'s folder, none, or more than 5 (review focus 4)', () => {
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], [])).toThrow('bad shots');
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], [`wish_shots/u2/${SID}/0.jpg`])).toThrow('bad shots');
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], Array.from({ length: 6 }, (_, i) => `wish_shots/u1/${SID}/${i}.jpg`))).toThrow('bad shots');
  });
  it('caps places at 10 with extras', () => {
    const extra = Array.from({ length: 12 }, (_, i) => ({ ...read.places[0], id: `x${i}` }));
    expect(screenshotSaveDoc('u1', SID, read, [], extra, [`wish_shots/u1/${SID}/0.jpg`]).places).toHaveLength(10);
  });
});

describe('newShotSaveId', () => {
  it('is s + the 20-char random id', () => {
    expect(newShotSaveId('AbCdEfGhIjKlMnOpQrSt')).toBe(SID);
  });
});

describe('shareKind (review focus 1: >5 images or mixed files never fail the share)', () => {
  const img = (n: number) => ({ path: `file:///tmp/${n}.png`, mimeType: 'image/png' });
  it('images win, first 5 kept, non-images ignored', () => {
    expect(shareKind({ files: [img(1), { path: 'file:///a.pdf', mimeType: 'application/pdf' }, img(2), img(3), img(4), img(5), img(6)] }))
      .toEqual({ kind: 'shots', uris: ['file:///tmp/1.png', 'file:///tmp/2.png', 'file:///tmp/3.png', 'file:///tmp/4.png', 'file:///tmp/5.png'] });
  });
  it('a TikTok link when there are no images', () => {
    expect(shareKind({ text: 'look https://vm.tiktok.com/ZM8x/' })).toEqual({ kind: 'link', url: 'https://vm.tiktok.com/ZM8x/' });
  });
  it('null for anything else', () => {
    expect(shareKind({ text: 'hello' })).toBeNull();
    expect(shareKind({ files: [{ path: 'file:///v.mov', mimeType: 'video/quicktime' }] })).toBeNull();
  });
});

describe('pending shares (review focus 2: a share survives sign-in; old parked links still parse)', () => {
  it('round-trips both kinds', () => {
    for (const p of [{ kind: 'link' as const, url: 'https://vm.tiktok.com/x/' }, { kind: 'shots' as const, uris: ['file:///1.jpg'] }]) {
      expect(parsePendingShare(encodePendingShare(p))).toEqual(p);
    }
  });
  it('reads an old plain-string link, and null/garbage as nothing', () => {
    expect(parsePendingShare('https://vm.tiktok.com/x/')).toEqual({ kind: 'link', url: 'https://vm.tiktok.com/x/' });
    expect(parsePendingShare(null)).toBeNull();
    expect(parsePendingShare('{"kind":"shots","uris":[]}')).toBeNull();
  });
});

import { shotUploadPlan } from '@/utils/wishShots';
describe('shotUploadPlan (self-review: a dropped upload left 0.jpg behind, and the retry re-uploaded it — refused, since storage rules allow no update)', () => {
  const uris = ['file:///a.png', 'file:///b.png', 'file:///c.png'];
  it('uploads everything the first time, at 0.jpg…', () => {
    expect(shotUploadPlan('u1', SID, uris, [])).toEqual([
      { uri: 'file:///a.png', path: `wish_shots/u1/${SID}/0.jpg` },
      { uri: 'file:///b.png', path: `wish_shots/u1/${SID}/1.jpg` },
      { uri: 'file:///c.png', path: `wish_shots/u1/${SID}/2.jpg` },
    ]);
  });
  it('on a retry, only what is missing', () => {
    expect(shotUploadPlan('u1', SID, uris, [`wish_shots/u1/${SID}/0.jpg`])).toEqual([
      { uri: 'file:///b.png', path: `wish_shots/u1/${SID}/1.jpg` },
      { uri: 'file:///c.png', path: `wish_shots/u1/${SID}/2.jpg` },
    ]);
    expect(shotUploadPlan('u1', SID, uris, uris.map((_, i) => `wish_shots/u1/${SID}/${i}.jpg`))).toEqual([]);
  });
  it('never more than 5', () => {
    expect(shotUploadPlan('u1', SID, Array.from({ length: 7 }, (_, i) => `file:///${i}.png`), [])).toHaveLength(5);
  });
});

import { shareKey } from '@/utils/wishShots';
describe('shareKey (fresh review I-5: a double-fired screenshot share opened two sheets and used two free reads)', () => {
  it('the same screenshots give the same key; a link keys by its url', () => {
    expect(shareKey({ kind: 'shots', uris: ['file:///a.png', 'file:///b.png'] })).toBe(shareKey({ kind: 'shots', uris: ['file:///a.png', 'file:///b.png'] }));
    expect(shareKey({ kind: 'shots', uris: ['file:///a.png'] })).not.toBe(shareKey({ kind: 'shots', uris: ['file:///b.png'] }));
    expect(shareKey({ kind: 'link', url: 'https://vm.tiktok.com/x/' })).toBe('https://vm.tiktok.com/x/');
  });
});
