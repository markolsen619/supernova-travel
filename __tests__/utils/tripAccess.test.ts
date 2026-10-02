import { isTripMember } from '@/utils/tripAccess';

describe('isTripMember', () => {
  const trip = { authorUid: 'owner', collaborators: ['friend'] };
  it('is the owner or someone who accepted an invite', () => {
    expect(isTripMember(trip, 'owner')).toBe(true);
    expect(isTripMember(trip, 'friend')).toBe(true);
  });
  it('is not a follower, a stranger, or nobody', () => {
    expect(isTripMember(trip, 'follower')).toBe(false);
    expect(isTripMember(trip, '')).toBe(false);
    expect(isTripMember(undefined, 'owner')).toBe(false);
    expect(isTripMember({ authorUid: 'owner', collaborators: undefined as unknown as string[] }, 'friend')).toBe(false);
  });
});
