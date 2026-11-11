import { imageSourceKey } from '@/utils/imageSourceKey';

describe('imageSourceKey (owner 2026-11-11: the generating screen\'s background flashed every second)', () => {
  it('the same address is the same key, whatever object carries it', () => {
    expect(imageSourceKey({ uri: 'https://x/c.jpg' })).toBe(imageSourceKey({ uri: 'https://x/c.jpg' }));
    expect(imageSourceKey({ uri: 'https://x/a.jpg' })).not.toBe(imageSourceKey({ uri: 'https://x/b.jpg' }));
  });
  it('bundled images (numbers) and nothing', () => {
    expect(imageSourceKey(12)).toBe('12');
    expect(imageSourceKey(null)).toBeNull();
  });
});
