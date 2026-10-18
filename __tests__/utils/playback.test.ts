import { arrivalHints, playbackPlan, stopPhotos, travelLabel } from '@/utils/playback';

describe('playbackPlan', () => {
  const stop = (id: string) => ({ id });
  it('plays day by day when a day has two located stops', () => {
    expect(playbackPlan([['d1', [stop('a'), stop('b')]], ['d2', [stop('c')]]])).toBe('byDay');
  });
  it('plays the whole trip when every day has one located stop (hand-made multi-city trips)', () => {
    expect(playbackPlan([['d1', [stop('a')]], ['d2', [stop('b')]], ['d3', [stop('c')]]])).toBe('wholeTrip');
  });
  it('nothing to play with fewer than two located stops', () => {
    expect(playbackPlan([['d1', [stop('a')]]])).toBe('none');
  });
});

describe('arrivalHints (how you reach each day, from its bookings)', () => {
  const day = (id: string, date: string) => ({ id, date: new Date(`${date}T12:00:00`) });
  it('a train ticket, a flight and a ferry each mark their day', () => {
    const hints = arrivalHints(
      [day('D1', '2026-11-01'), day('D2', '2026-11-02'), day('D3', '2026-11-03'), day('D4', '2026-11-04')],
      [
        { kind: 'reservation', item: { id: 'r', type: 'activity', transitMode: 'train', title: 'Prague → Budapest', checkIn: '2026-11-02', departureLocalTime: '09:00' } },
        { kind: 'boarding_pass', item: { id: 'p', airline: 'KLM', flightNumber: 'KL 1', origin: 'BUD', destination: 'AMS', localDate: '2026-11-03', departureTime: '2026-11-03T10:00:00', status: 'upcoming' } },
        { kind: 'reservation', item: { id: 'f', type: 'activity', transitMode: 'ferry', title: 'Ferry', checkIn: '2026-11-04' } },
      ] as never,
    );
    expect(hints).toEqual({ D2: 'train', D3: 'flight', D4: 'ferry' });
  });
  it('a cruise booking marks its day as cruise', () => {
    expect(arrivalHints([day('D1', '2026-11-01')], [{ kind: 'reservation', item: { id: 'c', type: 'activity', title: 'Aegean Cruise', checkIn: '2026-11-01' } }] as never)).toEqual({ D1: 'cruise' });
  });
});

describe('travelLabel', () => {
  it('names the method and where it goes', () => {
    expect(travelLabel('train', 'Budapest')).toBe('By train to Budapest');
    expect(travelLabel('flight', 'Amsterdam')).toBe('By plane to Amsterdam');
    expect(travelLabel('cruise', 'Santorini')).toBe('By cruise ship to Santorini');
    expect(travelLabel('walk', 'the Cove')).toBe('On foot to the Cove');
  });
});

describe('stopPhotos (who took a photo at each stop)', () => {
  const stops = [{ id: 'A', placeId: 'P1' }, { id: 'B', placeId: null }];
  const profiles = { U1: { name: 'Mark', avatarUrl: 'm.jpg' }, U2: { name: 'Kelly', avatarUrl: null } };
  it('journal photos (by the organizer) and members\' place photos, newest place photo first', () => {
    const out = stopPhotos(stops, { A: ['j1.jpg'] }, 'U1', [
      { uid: 'U2', placeId: 'P1', photoUrls: ['k1.jpg', 'k2.jpg'], moderationHidden: false },
      { uid: 'U3', placeId: 'P1', photoUrls: ['x.jpg'], moderationHidden: false },
    ], ['U1', 'U2'], profiles, new Set());
    expect(out.A).toEqual([
      { url: 'j1.jpg', uid: 'U1', name: 'Mark', avatarUrl: 'm.jpg' },
      { url: 'k1.jpg', uid: 'U2', name: 'Kelly', avatarUrl: null },
      { url: 'k2.jpg', uid: 'U2', name: 'Kelly', avatarUrl: null },
    ]);
    expect(out.B).toBeUndefined();
  });
  it('drops hidden reviews and blocked people', () => {
    const out = stopPhotos(stops, {}, 'U1', [
      { uid: 'U2', placeId: 'P1', photoUrls: ['k1.jpg'], moderationHidden: true },
    ], ['U1', 'U2'], profiles, new Set());
    expect(out.A).toBeUndefined();
    const blocked = stopPhotos(stops, {}, 'U1', [{ uid: 'U2', placeId: 'P1', photoUrls: ['k1.jpg'], moderationHidden: false }], ['U1', 'U2'], profiles, new Set(['U2']));
    expect(blocked.A).toBeUndefined();
  });
});
