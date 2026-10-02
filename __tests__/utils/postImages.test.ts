import { postImageUrls } from '@/utils/postImages';

describe('postImageUrls', () => {
  it('is every photo of a multi-photo post, in order', () => {
    expect(postImageUrls({ mediaUrls: ['a', 'b', 'c'], mediaUrl: 'a' })).toEqual(['a', 'b', 'c']);
  });
  it('falls back to the single photo on posts from before multi-photo', () => {
    expect(postImageUrls({ mediaUrl: 'a' })).toEqual(['a']);
    expect(postImageUrls({ mediaUrls: [], mediaUrl: 'a' })).toEqual(['a']);
  });
  it('drops empty entries and is empty when there is nothing', () => {
    expect(postImageUrls({ mediaUrls: ['a', '', 'b'] })).toEqual(['a', 'b']);
    expect(postImageUrls({})).toEqual([]);
  });
});
