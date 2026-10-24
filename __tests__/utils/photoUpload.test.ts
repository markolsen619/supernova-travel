// __tests__/utils/photoUpload.test.ts
import { uploadResize, PHOTO_MAX_PX, PHOTO_QUALITY } from '@/utils/photoUpload';

describe('uploadResize', () => {
  it('caps the long side of a portrait photo', () => {
    expect(uploadResize(3024, 4032)).toEqual({ height: PHOTO_MAX_PX });
  });
  it('caps the long side of a landscape photo', () => {
    expect(uploadResize(4032, 3024)).toEqual({ width: PHOTO_MAX_PX });
  });
  it('leaves a photo that already fits alone', () => {
    expect(uploadResize(1080, 1920)).toBeNull();
    expect(uploadResize(2048, 2048)).toBeNull();
  });
  it('unknown sizes are left alone rather than guessed', () => {
    expect(uploadResize(0, 0)).toBeNull();
    expect(uploadResize(NaN, 4000)).toBeNull();
  });
  it('matches what the feed photos were converted to on 2026-10-23', () => {
    expect(PHOTO_MAX_PX).toBe(2048);
    expect(PHOTO_QUALITY).toBe(0.8);
  });
});
