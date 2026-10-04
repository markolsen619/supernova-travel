import {
  foldName, calendarDay, bookingWindow, tripWindow, placeMatches, matchDecision,
  rematchable, linkPatchFor, tripMatchInputsChanged, toMatchableTrip, type MatchableTrip,
} from '../../functions/src/bookingMatch';

const rome: MatchableTrip = { id: 'rome', title: 'Rome in Spring', start: '2026-07-25', end: '2026-07-30',
  places: [{ city: 'Rome', countryCode: 'IT' }] };
const lisbon: MatchableTrip = { id: 'lis', title: 'Lisbon', start: '2026-07-26', end: '2026-07-29',
  places: [{ city: 'Lisbon', countryCode: 'PT' }] };
const tbd: MatchableTrip = { id: 'tbd', title: 'Someday', start: null, end: null, places: [{ city: 'Rome', countryCode: 'IT' }] };

describe('foldName / calendarDay', () => {
  it('folds accents, case and city aliases', () => {
    expect(foldName('Roma')).toBe(foldName('Rome'));
    expect(foldName('München')).toBe(foldName('Munich'));
    expect(foldName('  LISBOA ')).toBe(foldName('Lisbon'));
    expect(foldName('Washington, DC')).toBe('washington');
  });
  it('reads a calendar day from a date or an ISO instant (UTC day)', () => {
    expect(calendarDay('2026-07-25')).toBe('2026-07-25');
    expect(calendarDay('2026-07-25T23:30:00.000Z')).toBe('2026-07-25');
    expect(calendarDay('nonsense')).toBeNull();
    expect(calendarDay(null)).toBeNull();
  });
});

describe('bookingWindow / tripWindow', () => {
  it('a flight spans its local day ±1 (overnight arrivals, timezones)', () => {
    const w = bookingWindow({ kind: 'boarding_pass', localDate: '2026-07-25', placeCity: 'Rome' })!;
    expect(w.end - w.start).toBe(2);
  });
  it('a flight without localDate falls back to the departure instant', () => {
    expect(bookingWindow({ kind: 'boarding_pass', departureTime: '2026-07-25T08:10:00Z' })).not.toBeNull();
  });
  it('a reservation spans check-in to check-out, or just check-in', () => {
    const w = bookingWindow({ kind: 'reservation', checkIn: '2026-07-25', checkOut: '2026-07-28' })!;
    expect(w.end - w.start).toBe(3);
    const one = bookingWindow({ kind: 'reservation', checkIn: '2026-07-25' })!;
    expect(one.end).toBe(one.start);
  });
  it('a booking with no dates has no window', () => {
    expect(bookingWindow({ kind: 'reservation' })).toBeNull();
  });
  it('a trip window is padded a day each side (start stored as local midnight lands on the previous UTC day east of UTC)', () => {
    const w = tripWindow({ ...rome, start: '2026-07-24', end: '2026-07-29' })!;
    const hotel = bookingWindow({ kind: 'reservation', checkIn: '2026-07-30', checkOut: '2026-07-30' })!;
    expect(hotel.start <= w.end).toBe(true);
  });
  it('a Dates TBD trip has no window', () => {
    expect(tripWindow(tbd)).toBeNull();
  });
});

describe('placeMatches', () => {
  it('matches on country, or on city name with aliases', () => {
    expect(placeMatches([{ countryCode: 'IT' }], rome.places)).toBe(true);
    expect(placeMatches([{ city: 'Roma' }], rome.places)).toBe(true);
    expect(placeMatches([{ city: 'Paris', countryCode: 'FR' }], rome.places)).toBe(false);
  });
  it('unknown place is null, not false', () => {
    expect(placeMatches([{}], rome.places)).toBeNull();
    expect(placeMatches([], rome.places)).toBeNull();
  });
  it('a flight home matches on its origin', () => {
    const w = bookingWindow({ kind: 'boarding_pass', localDate: '2026-07-30',
      placeCity: 'New York', placeCountryCode: 'US', originCity: 'Rome', originCountryCode: 'IT' })!;
    expect(placeMatches(w.places, rome.places)).toBe(true);
  });
});

describe('matchDecision', () => {
  const hotel = { kind: 'reservation' as const, checkIn: '2026-07-25', checkOut: '2026-07-28', placeCity: 'Roma', placeCountryCode: 'IT' };
  it('one trip fits on dates and place: link it', () => {
    expect(matchDecision(hotel, [rome, lisbon, tbd])).toEqual({ kind: 'link', tripId: 'rome' });
  });
  it('two trips fit: ask, closest start first', () => {
    const rome2 = { ...rome, id: 'rome2', start: '2026-07-20', end: '2026-07-31' };
    expect(matchDecision(hotel, [rome2, rome])).toEqual({ kind: 'ask', tripIds: ['rome', 'rome2'] });
  });
  it('dates fit but the place is unknown: ask', () => {
    expect(matchDecision({ kind: 'reservation', checkIn: '2026-07-26' }, [rome, lisbon]))
      .toEqual({ kind: 'ask', tripIds: ['lis', 'rome'] });
  });
  it('dates fit, place known and different: none', () => {
    expect(matchDecision({ ...hotel, placeCity: 'Paris', placeCountryCode: 'FR' }, [rome])).toEqual({ kind: 'none' });
  });
  it('Dates TBD trips and undated bookings never match', () => {
    expect(matchDecision(hotel, [tbd])).toEqual({ kind: 'none' });
    expect(matchDecision({ kind: 'reservation', placeCity: 'Rome' }, [rome])).toEqual({ kind: 'none' });
  });
  it('asks about at most three trips', () => {
    const many = [1, 2, 3, 4].map((i) => ({ ...rome, id: `r${i}` }));
    const d = matchDecision({ kind: 'reservation', checkIn: '2026-07-26' }, many);
    expect(d.kind === 'ask' && d.tripIds.length).toBe(3);
  });
});

describe('rematchable / linkPatchFor', () => {
  it('re-decides unlinked bookings and auto links to the changed trip, never manual or dismissed', () => {
    expect(rematchable({ kind: 'reservation' }, 'rome')).toBe(true);
    expect(rematchable({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, 'rome')).toBe(true);
    expect(rematchable({ kind: 'reservation', tripId: 'lis', tripLink: 'auto' }, 'rome')).toBe(false);
    expect(rematchable({ kind: 'reservation', tripId: 'rome', tripLink: 'manual' }, 'rome')).toBe(false);
    expect(rematchable({ kind: 'reservation', tripLinkDismissed: true }, 'rome')).toBe(false);
  });
  it('writes only what changes', () => {
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'link', tripId: 'rome' }))
      .toEqual({ tripId: 'rome', tripLink: 'auto', tripSuggestions: [] });
    expect(linkPatchFor({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, { kind: 'link', tripId: 'rome' })).toBeNull();
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'ask', tripIds: ['a', 'b'] }))
      .toEqual({ tripSuggestions: ['a', 'b'] });
    expect(linkPatchFor({ kind: 'reservation' }, { kind: 'none' })).toBeNull();
  });
  it('an auto link to a trip that no longer fits is removed', () => {
    expect(linkPatchFor({ kind: 'reservation', tripId: 'rome', tripLink: 'auto' }, { kind: 'none' }, 'rome'))
      .toEqual({ tripId: null, tripLink: null, tripSuggestions: [] });
  });
});

describe('tripMatchInputsChanged', () => {
  const t = { startDate: { toMillis: () => 1 }, endDate: { toMillis: () => 2 }, destination: { name: 'Rome', countryCode: 'IT' },
    additionalDestinations: [], collaborators: [], likesCount: 0 };
  it('created, deleted, dates, places or members changed: yes', () => {
    expect(tripMatchInputsChanged(undefined, t)).toBe(true);
    expect(tripMatchInputsChanged(t, undefined)).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, endDate: { toMillis: () => 3 } })).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, destination: { name: 'Milan', countryCode: 'IT' } })).toBe(true);
    expect(tripMatchInputsChanged(t, { ...t, collaborators: ['x'] })).toBe(true);
  });
  it('likes, covers, titles: no', () => {
    expect(tripMatchInputsChanged(t, { ...t, likesCount: 5, coverImageUrl: 'x', title: 'New' })).toBe(false);
  });
});

describe('toMatchableTrip', () => {
  it('reads dates as UTC days and every destination as a place', () => {
    const t = toMatchableTrip('rome', {
      title: 'Rome', startDate: { toDate: () => new Date('2026-07-24T22:00:00Z') }, endDate: { toDate: () => new Date('2026-07-29T22:00:00Z') },
      destination: { name: 'Rome', countryCode: 'IT' }, additionalDestinations: [{ name: 'Florence', countryCode: 'IT' }],
    });
    expect(t).toEqual({ id: 'rome', title: 'Rome', start: '2026-07-24', end: '2026-07-29',
      places: [{ city: 'Rome', countryCode: 'IT' }, { city: 'Florence', countryCode: 'IT' }] });
  });
  it('a trip without dates is Dates TBD', () => {
    expect(toMatchableTrip('x', { title: 'X', destination: { name: 'Rome' } }).start).toBeNull();
  });
});
