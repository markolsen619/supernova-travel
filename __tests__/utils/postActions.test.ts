import { ownPostMenu, deletePostConfirm, doubleTapLike } from '@/utils/postActions';

describe('ownPostMenu', () => {
  it('offers edit and delete on your own post, nothing on someone else’s', () => {
    expect(ownPostMenu({ authorUid: 'me' }, 'me')).toEqual(['edit', 'delete']);
    expect(ownPostMenu({ authorUid: 'them' }, 'me')).toEqual([]);
    expect(ownPostMenu({ authorUid: 'me' }, '')).toEqual([]);
  });
});

describe('deletePostConfirm', () => {
  it('reassures that deleting a trip post keeps the trip', () => {
    expect(deletePostConfirm({ mediaType: 'trip' })).toEqual({
      title: 'Delete this post?',
      message: 'Your trip stays. Only this post is removed from the feed.',
    });
  });
  it('warns that a photo post and its photos are gone for good', () => {
    expect(deletePostConfirm({ mediaType: 'photo' }).message).toBe("Its photos, likes and comments are deleted too. This can't be undone.");
    expect(deletePostConfirm({ mediaType: 'video' }).message).toBe("Its video, likes and comments are deleted too. This can't be undone.");
  });
});

describe('doubleTapLike', () => {
  it('likes with a heart burst, and a second double tap unlikes', () => {
    expect(doubleTapLike(false)).toEqual({ liked: true, burst: 'like' });
    expect(doubleTapLike(true)).toEqual({ liked: false, burst: 'unlike' });
  });
});
