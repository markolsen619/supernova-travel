import {
  MAX_VIDEO_BYTES, clipDurationSec, postingProgress, videoAspect, videoDisplay,
  videoPostFields, videoProblem, videoStoragePaths,
} from '@/utils/videoPost';

describe('clipDurationSec', () => {
  it('prefers the picker, in seconds', () => expect(clipDurationSec(29_400, 12)).toBe(29.4));
  it('falls back to the file when the picker has none', () => {
    expect(clipDurationSec(null, 18.2)).toBe(18.2);
    expect(clipDurationSec(undefined, undefined)).toBeNull();
  });
});

describe('videoProblem', () => {
  it('accepts a full trip recap, up to 60 s (owner 2026-10-26), allowing the picker a little rounding', () => {
    expect(videoProblem({ durationSec: 36, bytes: 12_000_000 })).toBeNull();
    expect(videoProblem({ durationSec: 60.4, bytes: 19_000_000 })).toBeNull();
  });
  it('refuses a longer clip, an unknown length and an oversized file', () => {
    expect(videoProblem({ durationSec: 61, bytes: 1 })).toBe('Clips can be up to a minute. Trim it and try again.');
    expect(videoProblem({ durationSec: null, bytes: 1 })).toBe("That clip couldn't be read. Try another one.");
    expect(videoProblem({ durationSec: 20, bytes: MAX_VIDEO_BYTES + 1 })).toBe('That clip is too large to post. Try a shorter one.');
  });
});

describe('videoAspect', () => {
  // A portrait iPhone clip is often stored 1920x1080 with a rotation flag; the
  // cover frame comes out upright, which is why callers pass its size.
  it('is width over height of the upright frame', () => expect(videoAspect(720, 1280)).toBeCloseTo(0.5625));
  it('assumes portrait when the size is unknown', () => {
    expect(videoAspect(0, 0)).toBeCloseTo(9 / 16);
    expect(videoAspect(null, undefined)).toBeCloseTo(9 / 16);
  });
});

describe('videoDisplay', () => {
  it('shows landscape whole, portrait full-bleed', () => {
    expect(videoDisplay({ aspect: 1.78, thumbnailUrl: 'c.jpg' })).toEqual({ landscape: true, coverUrl: 'c.jpg' });
    expect(videoDisplay({ aspect: 0.56, thumbnailUrl: 'c.jpg' }).landscape).toBe(false);
  });
  it('copes with a post that has neither', () => {
    expect(videoDisplay({})).toEqual({ landscape: false, coverUrl: null });
  });
});

describe('videoPostFields', () => {
  it('keeps older apps working: mediaUrl plays, mediaUrls shows the cover', () => {
    expect(videoPostFields({ videoUrl: 'v.mp4', coverUrl: 'c.jpg', durationSec: 12.345, aspect: 0.56251 })).toEqual({
      mediaType: 'video', mediaUrl: 'v.mp4', mediaUrls: ['c.jpg'], thumbnailUrl: 'c.jpg', durationSec: 12.3, aspect: 0.563,
    });
  });
});

describe('videoStoragePaths', () => {
  it('puts both files in the folder post deletion clears', () => {
    expect(videoStoragePaths('u1', 42)).toEqual({ video: 'posts/u1/videos/42.mp4', cover: 'posts/u1/videos/42.jpg' });
  });
});

describe('postingProgress', () => {
  it('spends 40% on compressing and the rest on uploading', () => {
    expect(postingProgress('compress', 0.5)).toBe(20);
    expect(postingProgress('upload', 0)).toBe(40);
    expect(postingProgress('upload', 1)).toBe(100);
    expect(postingProgress('upload', 7)).toBe(100);
  });
});
