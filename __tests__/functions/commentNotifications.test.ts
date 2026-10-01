import { commentNotificationTargets, commentInboxes } from '../../functions/src/commentNotifications';

describe('commentNotificationTargets', () => {
  it('tells the post author about a new comment', () => {
    expect(commentNotificationTargets({ postAuthorUid: 'me', commenterUid: 'ana', replyToUid: null }))
      .toEqual([{ uid: 'me', type: 'post_comment' }]);
  });

  it('tells the person replied to, and the post author separately', () => {
    expect(commentNotificationTargets({ postAuthorUid: 'me', commenterUid: 'ana', replyToUid: 'ben' }))
      .toEqual([{ uid: 'ben', type: 'comment_reply' }, { uid: 'me', type: 'post_comment' }]);
  });

  it('sends the post author one notification, not two, when the reply is to them', () => {
    expect(commentNotificationTargets({ postAuthorUid: 'me', commenterUid: 'ana', replyToUid: 'me' }))
      .toEqual([{ uid: 'me', type: 'comment_reply' }]);
  });

  it('never notifies you about your own comment', () => {
    // The post author replying to a commenter on their own post.
    expect(commentNotificationTargets({ postAuthorUid: 'me', commenterUid: 'me', replyToUid: 'ana' }))
      .toEqual([{ uid: 'ana', type: 'comment_reply' }]);
    // Replying to yourself on your own post.
    expect(commentNotificationTargets({ postAuthorUid: 'me', commenterUid: 'me', replyToUid: 'me' })).toEqual([]);
  });
});

describe('commentInboxes', () => {
  it('lists every inbox that can hold a notification about this comment, once each', () => {
    expect(commentInboxes({ postAuthorUid: 'me', commentAuthorUid: 'ana', replyToUid: 'ben' }).sort()).toEqual(['ana', 'ben', 'me']);
    expect(commentInboxes({ postAuthorUid: 'me', commentAuthorUid: 'me', replyToUid: null })).toEqual(['me']);
    expect(commentInboxes({ postAuthorUid: '', commentAuthorUid: 'ana', replyToUid: '' })).toEqual(['ana']);
  });
});
