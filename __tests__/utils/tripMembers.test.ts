import { memberRows } from '@/utils/tripMembers';

describe('memberRows (People on this trip)', () => {
  const profiles = { A: { name: 'Mark Olsen', avatarUrl: 'a.jpg' }, B: { name: 'Kelly D', avatarUrl: null } };
  it('organizer first, then everyone going, with their names', () => {
    expect(memberRows('A', ['B', 'C'], profiles)).toEqual([
      { uid: 'A', name: 'Mark Olsen', avatarUrl: 'a.jpg', role: 'Organizer' },
      { uid: 'B', name: 'Kelly D', avatarUrl: null, role: 'Going' },
      { uid: 'C', name: 'Traveler', avatarUrl: null, role: 'Going' },
    ]);
  });
  it('never lists the organizer twice', () => {
    expect(memberRows('A', ['A', 'B'], profiles).map((r) => r.uid)).toEqual(['A', 'B']);
  });
});
