import { likePushCopy, commentLikePushCopy, commentPushCopy, notificationDocWithCopy } from '../../functions/src/pushCopy';
import { pushDataFor } from '../../functions/src/pushData';

describe('push copy says who did what', () => {
  it('names the liker and quotes the post', () => {
    expect(likePushCopy('Kell Bell', 'Sunset over the Danube from the Fisherman’s Bastion')).toEqual({
      title: 'Kell Bell liked your post', body: '“Sunset over the Danube from the Fisherman’s Bastion”' });
    expect(likePushCopy('Kell Bell', '')).toEqual({ title: 'Kell Bell liked your post', body: 'Tap to see it' });
  });
  it('trims a long caption', () => {
    expect(likePushCopy('K', 'x'.repeat(200)).body.length).toBeLessThanOrEqual(84);
  });
  it('names comment likes, comments and replies', () => {
    expect(commentLikePushCopy('Kell', 'So good')).toEqual({ title: 'Kell liked your comment', body: '“So good”' });
    expect(commentPushCopy('post_comment', 'Kell', 'Love this')).toEqual({ title: 'Kell commented on your post', body: '“Love this”' });
    expect(commentPushCopy('comment_reply', 'Kell', 'Same')).toEqual({ title: 'Kell replied to your comment', body: '“Same”' });
  });
});

describe('pushDataFor carries the notification id', () => {
  it('so a tap the app cannot route still finds the notification', () => {
    expect(pushDataFor({ type: 'post_like', postId: 'p1', likerName: 'K' }, 'n1')).toEqual({ type: 'post_like', postId: 'p1', notificationId: 'n1' });
  });
});

describe('notificationDocWithCopy', () => {
  it('saves the push wording on the in-app notification, so any build can show it', () => {
    expect(notificationDocWithCopy({ type: 'post_like', postId: 'p1' }, { title: 'Kell liked your post', body: '“Hi”' }))
      .toEqual({ type: 'post_like', postId: 'p1', title: 'Kell liked your post', body: '“Hi”' });
  });
  it('keeps a notification’s own title and body', () => {
    expect(notificationDocWithCopy({ type: 'x', title: 'Own', body: 'Mine' }, { title: 'Push', body: 'P' }))
      .toEqual({ type: 'x', title: 'Own', body: 'Mine' });
  });
});
