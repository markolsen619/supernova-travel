import { connectionQuery, connectionUids } from '@/utils/connections';

const follows = [
  { followerUid: 'ana', followeeUid: 'me' },
  { followerUid: 'me', followeeUid: 'ben' },
  { followerUid: 'cal', followeeUid: 'me' },
  { followerUid: 'ana', followeeUid: 'me' }, // a duplicate never shows twice
];

describe('connectionQuery', () => {
  it("finds someone's followers by followee, and who they follow by follower", () => {
    expect(connectionQuery('followers')).toEqual({ matchField: 'followeeUid', otherField: 'followerUid' });
    expect(connectionQuery('following')).toEqual({ matchField: 'followerUid', otherField: 'followeeUid' });
  });
});

describe('connectionUids', () => {
  it('lists the other person in each follow, once, in order', () => {
    expect(connectionUids(follows.filter((f) => f.followeeUid === 'me'), 'followers')).toEqual(['ana', 'cal']);
    expect(connectionUids(follows.filter((f) => f.followerUid === 'me'), 'following')).toEqual(['ben']);
  });
  it('skips malformed follow docs', () => {
    expect(connectionUids([{ followerUid: '', followeeUid: 'me' }, {} as never], 'followers')).toEqual([]);
  });
});
