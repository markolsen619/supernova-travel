import { dayCaption, openingEyebrow, outputSize, pickFilmPhotos, shouldCaptureFrame } from '@/utils/tripVideo';

describe('trip video captions', () => {
  it('dates and length above the title', () => {
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 30), 6)).toBe('JUL 25 – 30 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 10, 28), new Date(2026, 11, 3), 6)).toBe('NOV 28 – DEC 3 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 25), 1)).toBe('JUL 25 · 1 DAY');
  });
  it('no dates: just the length', () => {
    expect(openingEyebrow(null, null, 4)).toBe('4 DAYS');
  });
  it('a day and its city', () => {
    expect(dayCaption(2, 'Lisbon')).toBe('DAY 2 · LISBON');
    expect(dayCaption(3, null)).toBe('DAY 3');
    expect(dayCaption(3, '  ')).toBe('DAY 3');
  });
});

describe('pickFilmPhotos (photos in the trip video)', () => {
  const day = (dayId: string, ...stopIds: string[]) => ({ dayId, stopIds });
  const has = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, [{ url: `https://x/${id}.jpg` }]]));
  it('one photo per day first, then more in trip order, up to the cap', () => {
    const days = [day('d1', 'a', 'b', 'c'), day('d2', 'd', 'e'), day('d3', 'f')];
    const picked = pickFilmPhotos(days, has('a', 'b', 'c', 'd', 'e', 'f'), 4);
    expect([...picked]).toEqual(['a', 'd', 'f', 'b']);
  });
  it('stops without photos are never picked; nothing to show gives an empty set', () => {
    expect([...pickFilmPhotos([day('d1', 'a', 'b')], has('b'), 8)]).toEqual(['b']);
    expect(pickFilmPhotos([day('d1', 'a')], {}, 8).size).toBe(0);
  });
  it('default cap is 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => day(`d${i}`, `s${i}`));
    expect(pickFilmPhotos(many, has(...many.map((d) => d.stopIds[0]))).size).toBe(8);
  });
});

describe('android frame capture rules', () => {
  it('captures at most every 33 ms', () => {
    expect(shouldCaptureFrame(null, 1000)).toBe(true);
    expect(shouldCaptureFrame(1000, 1020)).toBe(false);
    expect(shouldCaptureFrame(1000, 1033)).toBe(true);
  });
  it('output ≤ 1080 wide, even, aspect kept', () => {
    expect(outputSize(1440, 3088)).toEqual({ width: 1080, height: 2316 });
    expect(outputSize(1079, 2337)).toEqual({ width: 1078, height: 2336 });
    expect(outputSize(720, 1600)).toEqual({ width: 720, height: 1600 });
  });
  it('nothing to record gives null', () => {
    expect(outputSize(0, 2000)).toBeNull();
    expect(outputSize(1080, 1)).toBeNull();
  });
});
