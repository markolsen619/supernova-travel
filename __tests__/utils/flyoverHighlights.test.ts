import { momentHoldMs, photoIndexAt, highlightFilmPhotos, HIGHLIGHT_PHOTO_MS } from '@/utils/flyover';

describe('momentHoldMs', () => {
  it('arrive + 2 s a photo, or a short hold without photos', () => {
    expect(momentHoldMs(0)).toBe(1500);
    expect(momentHoldMs(1)).toBe(3500);
    expect(momentHoldMs(4)).toBe(9500);
    expect(momentHoldMs(9)).toBe(9500); // capped at 4
  });
});

describe('photoIndexAt', () => {
  it('no photo while the camera arrives, then one every 2 s', () => {
    const total = momentHoldMs(3);
    expect(photoIndexAt(total, total, 3)).toBeNull();
    expect(photoIndexAt(total, total - 1600, 3)).toBe(0);
    expect(photoIndexAt(total, total - 3600, 3)).toBe(1);
    expect(photoIndexAt(total, 10, 3)).toBe(2);
    expect(photoIndexAt(1500, 100, 0)).toBeNull();
  });
});

describe('highlightFilmPhotos', () => {
  it('keeps every photo when it fits', () => {
    expect(highlightFilmPhotos([[2, 1], [3]], 54000, 20000)).toEqual([[2, 1], [3]]);
  });
  it('drops from the busiest day first (ties: the later day), never below 2 s a photo', () => {
    // 6 photos = 12 s; room for 8 s → 4 photos.
    const out = highlightFilmPhotos([[3, 1], [2]], 28000, 20000);
    expect(out.flat().reduce((a: number, b: number) => a + b, 0) * HIGHLIGHT_PHOTO_MS).toBeLessThanOrEqual(8000);
    expect(out).toEqual([[2, 1], [1]]);
  });
  it('shows none when there is no room', () => {
    expect(highlightFilmPhotos([[4]], 10000, 12000)).toEqual([[0]]);
  });
});
