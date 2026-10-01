import { threadComments, replyFieldsFor, commentMenu } from '@/utils/commentThreads';
import type { Comment } from '@/types';

const c = (id: string, over: Partial<Comment> = {}) =>
  ({ id, authorUid: `u-${id}`, authorDisplayName: `Name ${id}`, authorAvatarUrl: null, text: id, createdAt: null, ...over }) as unknown as Comment;
const reply = (id: string, to: Comment) => c(id, replyFieldsFor(to));

describe('replyFieldsFor', () => {
  it('points at the comment and its thread root', () => {
    const a = c('a');
    expect(replyFieldsFor(a)).toEqual({ replyTo: { commentId: 'a', rootId: 'a', authorUid: 'u-a', authorName: 'Name a' } });
    // Replying to a reply joins the same thread, but still names who you answered.
    const b = reply('b', a);
    expect(replyFieldsFor(b)).toEqual({ replyTo: { commentId: 'b', rootId: 'a', authorUid: 'u-b', authorName: 'Name b' } });
  });
});

describe('threadComments', () => {
  it('puts replies under the comment they belong to, in order', () => {
    const a = c('a'), b = c('b');
    const a1 = reply('a1', a), b1 = reply('b1', b), a2 = reply('a2', a1);
    const threads = threadComments([a, b, a1, b1, a2]);
    expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', ['b1']],
    ]);
  });

  it('keeps replies whose comment was deleted, at the top level where they were', () => {
    const a = c('a'), b = c('b');
    const a1 = reply('a1', a);
    const threads = threadComments([b, a1]); // a was deleted
    expect(threads.map((t) => t.comment.id)).toEqual(['b', 'a1']);
  });

  it('handles an empty list', () => {
    expect(threadComments([])).toEqual([]);
  });
});

describe('commentMenu', () => {
  it('reports and blocks on someone else’s comment, and lets the post’s author delete it', () => {
    const theirs = c('a');
    expect(commentMenu(theirs, 'me', 'someoneElse')).toEqual(['report', 'block']);
    expect(commentMenu(theirs, 'me', 'me')).toEqual(['delete', 'report', 'block']);
  });
  it('has no menu on your own comment (it has its own edit and delete)', () => {
    expect(commentMenu(c('a', { authorUid: 'me' }), 'me', 'me')).toEqual([]);
  });
});
