import { postStoragePaths, linkedPostsToDelete } from '../../functions/src/postCleanup';

const url = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/supernova-a2125.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media&token=abc`;

describe('postStoragePaths', () => {
  it("returns the author's own uploaded files, once each", () => {
    const post = {
      authorUid: 'u1',
      mediaUrls: [url('posts/u1/1_0.jpg'), url('posts/u1/1_1.jpg')],
      mediaUrl: url('posts/u1/1_0.jpg'),
      thumbnailUrl: url('posts/u1/1_0.jpg'),
    };
    expect(postStoragePaths(post)).toEqual(['posts/u1/1_0.jpg', 'posts/u1/1_1.jpg']);
  });

  it("never touches someone else's files or anything outside the author's posts folder", () => {
    const post = {
      authorUid: 'u1',
      mediaUrls: [
        url('posts/u2/9_0.jpg'), // another user's upload
        url('profile_photos/u1/me.jpg'), // the author's avatar, not this post
        url('posts/u1/../u2/x.jpg'), // path tricks
      ],
      // A trip post's cover is a Google Places photo, not ours to delete.
      mediaUrl: 'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=1200',
      thumbnailUrl: null,
    };
    expect(postStoragePaths(post)).toEqual([]);
  });

  it('tolerates missing and malformed fields', () => {
    expect(postStoragePaths({ authorUid: 'u1' })).toEqual([]);
    expect(postStoragePaths({ authorUid: 'u1', mediaUrls: ['not a url', '', null as unknown as string] })).toEqual([]);
    expect(postStoragePaths({ authorUid: '', mediaUrls: [url('posts//a.jpg')] })).toEqual([]);
  });
});

describe('linkedPostsToDelete', () => {
  it("deletes only the trip owner's own posts about the trip", () => {
    const posts = [
      { id: 'p1', authorUid: 'owner' },
      { id: 'p2', authorUid: 'friend' },
      { id: 'p3', authorUid: 'owner' },
    ];
    expect(linkedPostsToDelete(posts, 'owner')).toEqual(['p1', 'p3']);
    expect(linkedPostsToDelete(posts, '')).toEqual([]);
  });
});
