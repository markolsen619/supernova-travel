import { ownAndJoinedTrips, isJoinedTrip, joinedTripOwners } from '@/utils/joinedTrips';

const t = (id: string, authorUid: string, ms: number) => ({ id, authorUid, createdAt: { toMillis: () => ms } });

describe('joined trips on your own Trips tab', () => {
  const own = [t('mine1', 'me', 300), t('mine2', 'me', 100)];
  const joined = [t('marks', 'mark', 200), t('mine1', 'me', 300)]; // you can also be a collaborator on your own trip's query edge

  it('lists your trips and the ones you joined together, newest first, each once', () => {
    expect(ownAndJoinedTrips(own, joined).map((x) => x.id)).toEqual(['mine1', 'marks', 'mine2']);
  });
  it('a joined trip is one someone else created', () => {
    expect(isJoinedTrip(t('marks', 'mark', 1), 'me')).toBe(true);
    expect(isJoinedTrip(t('mine1', 'me', 1), 'me')).toBe(false);
  });
  it('names the owners to look up for the cards, once each, never you', () => {
    expect(joinedTripOwners([...own, t('a', 'mark', 1), t('b', 'mark', 2), t('c', 'kell', 3)], 'me')).toEqual(['mark', 'kell']);
  });
});
