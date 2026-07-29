jest.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

import { resolveMediaUrls, PhotoItem } from '@/hooks/useEditPost';

describe('resolveMediaUrls', () => {
  it('keeps existing URLs and substitutes uploaded URLs for new items, in order', () => {
    const items: PhotoItem[] = [
      { kind: 'existing', url: 'https://cdn/a.jpg' },
      { kind: 'new', localUri: 'file://local/b.jpg' },
      { kind: 'existing', url: 'https://cdn/c.jpg' },
    ];
    const uploaded = { 'file://local/b.jpg': 'https://cdn/b.jpg' };
    expect(resolveMediaUrls(items, uploaded)).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b.jpg',
      'https://cdn/c.jpg',
    ]);
  });

  it('returns an empty array when given no items', () => {
    expect(resolveMediaUrls([], {})).toEqual([]);
  });

  it('preserves reordering — output order matches input item order, not upload order', () => {
    const items: PhotoItem[] = [
      { kind: 'new', localUri: 'file://local/second.jpg' },
      { kind: 'existing', url: 'https://cdn/first.jpg' },
    ];
    const uploaded = { 'file://local/second.jpg': 'https://cdn/second.jpg' };
    expect(resolveMediaUrls(items, uploaded)).toEqual([
      'https://cdn/second.jpg',
      'https://cdn/first.jpg',
    ]);
  });
});
