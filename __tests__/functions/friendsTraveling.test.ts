import {
  calendarDay, isTripUnderwayToday, pickTodayTrip, shouldSeeTraveler, todayKey, todaysCity, travelInputsChanged,
} from '../../functions/src/friendsTraveling';

const D = (iso: string) => Date.parse(iso);
const trip = {
  visibility: 'followers', authorUid: 'mark',
  startDateMs: D('2026-11-17T23:00:00Z'), endDateMs: D('2026-12-04T23:00:00Z'), // Paris midnights
  destination: { name: 'Prague', lat: 50.08, lng: 14.43 },
  additionalDestinations: [{ name: 'Budapest', lat: 47.5, lng: 19.04 }, { name: 'Vienna', lat: null, lng: null }],
};

describe('calendarDay', () => {
  it('reads a date stored at local midnight as that local date, east or west of UTC', () => {
    expect(calendarDay(D('2026-11-17T23:00:00Z'))).toBe('2026-11-18'); // Paris midnight
    expect(calendarDay(D('2026-11-18T08:00:00Z'))).toBe('2026-11-18'); // Los Angeles midnight
  });
  it('todayKey is the UTC day of now', () => expect(todayKey(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-20'));
});

describe('isTripUnderwayToday', () => {
  it('is true from the first day to the last, for shared trips only', () => {
    expect(isTripUnderwayToday(trip, '2026-11-18')).toBe(true);
    expect(isTripUnderwayToday(trip, '2026-12-05')).toBe(true);
    expect(isTripUnderwayToday(trip, '2026-12-06')).toBe(false);
    expect(isTripUnderwayToday(trip, '2026-11-17')).toBe(false);
  });
  it('never for a private, hidden or undated trip', () => {
    expect(isTripUnderwayToday({ ...trip, visibility: 'private' }, '2026-11-20')).toBe(false);
    expect(isTripUnderwayToday({ ...trip, moderationHidden: true }, '2026-11-20')).toBe(false);
    expect(isTripUnderwayToday({ ...trip, startDateMs: null }, '2026-11-20')).toBe(false);
  });
});

describe('todaysCity', () => {
  const days = [
    { dateMs: D('2026-11-17T23:00:00Z'), destinationIndex: 0 },
    { dateMs: D('2026-11-21T23:00:00Z'), destinationIndex: 1 },
    { dateMs: D('2026-11-25T23:00:00Z'), destinationIndex: 2 },
    { dateMs: D('2026-11-26T23:00:00Z'), destinationIndex: null },
  ];
  it("is the city of the day dated today", () => {
    expect(todaysCity(trip, days, '2026-11-22')).toEqual({ city: 'Budapest', lat: 47.5, lng: 19.04 });
    expect(todaysCity(trip, days, '2026-11-27')).toEqual({ city: 'Prague', lat: 50.08, lng: 14.43 }); // null → first
  });
  it('is nothing without a day today or without coordinates', () => {
    expect(todaysCity(trip, days, '2026-11-20')).toBeNull();
    expect(todaysCity(trip, days, '2026-11-26')).toBeNull(); // Vienna has no coordinates
  });
});

describe('pickTodayTrip', () => {
  it('takes the trip whose current day started latest', () => {
    expect(pickTodayTrip([{ id: 'a', dayStartMs: 1 }, { id: 'b', dayStartMs: 5 }])?.id).toBe('b');
    expect(pickTodayTrip([])).toBeNull();
  });
});

describe('shouldSeeTraveler', () => {
  const base = { viewerFollowsTraveler: true, viewerFollowsAuthor: true, travelerIsAuthor: true, visibility: 'followers', showOnGlobe: undefined, blocked: false };
  it('shows followers, with the switch on by default', () => expect(shouldSeeTraveler(base)).toBe(true));
  it('respects the switch, follows and blocks', () => {
    expect(shouldSeeTraveler({ ...base, showOnGlobe: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, viewerFollowsTraveler: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, blocked: true })).toBe(false);
  });
  it("shows a collaborator's followers-only trip only to people who can open it", () => {
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: false })).toBe(false);
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: true })).toBe(true);
    expect(shouldSeeTraveler({ ...base, travelerIsAuthor: false, viewerFollowsAuthor: false, visibility: 'public' })).toBe(true);
  });
});

describe('travelInputsChanged', () => {
  it('ignores writes that change nothing the globe uses', () => {
    expect(travelInputsChanged(trip, { ...trip })).toBe(false);
  });
  it('reacts to dates, cities, visibility, hiding, collaborators, creation and deletion', () => {
    expect(travelInputsChanged(trip, { ...trip, visibility: 'private' })).toBe(true);
    expect(travelInputsChanged(trip, { ...trip, endDateMs: 1 })).toBe(true);
    expect(travelInputsChanged(trip, { ...trip, collaborators: ['kell'] })).toBe(true);
    expect(travelInputsChanged(null, trip)).toBe(true);
    expect(travelInputsChanged(trip, null)).toBe(true);
  });
});

describe('todaysCity on real days', () => {
  // Days don't store a date: it's the trip's start plus (dayNumber − 1). The first run found no
  // traveller at all on the Central Europe trip because only a stored date was looked at.
  const realTrip = { ...trip, startDateMs: D('2026-11-18T08:00:00Z') }; // Los Angeles midnight
  const days = [
    { dateMs: null, dayNumber: 1, destinationIndex: 0 },
    { dateMs: null, dayNumber: 4, destinationIndex: 1 },
  ];
  it('works out each day from the trip start and its number', () => {
    expect(todaysCity(realTrip, days, '2026-11-18')).toEqual({ city: 'Prague', lat: 50.08, lng: 14.43 });
    expect(todaysCity(realTrip, days, '2026-11-21')).toEqual({ city: 'Budapest', lat: 47.5, lng: 19.04 });
    expect(todaysCity(realTrip, days, '2026-11-19')).toBeNull();
  });
});

describe('UTC+13 (review)', () => {
  // A trip made in New Zealand summer time: local midnight 18 Nov = 11:00Z on the 17th, which the
  // noon rule reads as the 17th. The app saves the exact day (startDay, 1.0.4+): trust it.
  const nz = {
    visibility: 'followers', authorUid: 'mark', startDay: '2026-11-18',
    startDateMs: D('2026-11-17T11:00:00Z'), endDateMs: D('2026-11-21T11:00:00Z'),
    destination: { name: 'Auckland', lat: -36.85, lng: 174.76 },
    additionalDestinations: [{ name: 'Queenstown', lat: -45.03, lng: 168.66 }],
  };
  const days = [{ dateMs: null, dayNumber: 1, destinationIndex: 0 }, { dateMs: null, dayNumber: 3, destinationIndex: 1 }];
  it('starts and ends on the right days', () => {
    expect(isTripUnderwayToday(nz, '2026-11-17')).toBe(false);
    expect(isTripUnderwayToday(nz, '2026-11-18')).toBe(true);
    expect(isTripUnderwayToday(nz, '2026-11-22')).toBe(true);
    expect(isTripUnderwayToday(nz, '2026-11-23')).toBe(false);
  });
  it("puts each day in that day's city", () => {
    expect(todaysCity(nz, days, '2026-11-18')?.city).toBe('Auckland');
    expect(todaysCity(nz, days, '2026-11-20')?.city).toBe('Queenstown');
    expect(todaysCity(nz, days, '2026-11-19')).toBeNull();
  });
  it('ignores a saved day that no longer agrees with the date (moved by an older app)', () => {
    expect(isTripUnderwayToday({ ...nz, startDay: '2026-10-01' }, '2026-11-17')).toBe(true);
  });
});
