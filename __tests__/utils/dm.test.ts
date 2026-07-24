import { Timestamp } from 'firebase/firestore';
import { sortedPairId, formatGroupName, isThreadUnread } from '@/utils/dm';

describe('sortedPairId', () => {
  it('sorts uids alphabetically regardless of argument order', () => {
    expect(sortedPairId('userB', 'userA')).toBe('userA_userB');
    expect(sortedPairId('userA', 'userB')).toBe('userA_userB');
  });
});

describe('formatGroupName', () => {
  it('joins all names when at or under the max', () => {
    expect(formatGroupName(['Sarah', 'Alex'])).toBe('Sarah, Alex');
  });

  it('truncates with a "+N more" tail beyond the max', () => {
    expect(formatGroupName(['Sarah', 'Alex', 'Jordan', 'Kim'], 3)).toBe('Sarah, Alex, Jordan +1 more');
  });
});

describe('isThreadUnread', () => {
  const lastMessageAt = Timestamp.fromMillis(1_000_000);

  it('is false when I sent the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'me' }, 'me', null)).toBe(false);
  });

  it('is false when there is no last message yet', () => {
    expect(isThreadUnread({ lastMessageAt: null, lastMessageSenderUid: null }, 'me', null)).toBe(false);
  });

  it('is true when never read and someone else sent the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', null)).toBe(true);
  });

  it('is true when the last message arrived after my read cursor', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', 900_000)).toBe(true);
  });

  it('is false when I already read past the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', 1_000_001)).toBe(false);
  });
});
