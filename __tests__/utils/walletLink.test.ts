import { linkPatch, tripDateEyebrow, draftPlaceFields } from '@/utils/walletLink';

describe('linkPatch', () => {
  it('a manual link clears suggestions and any dismissal', () => {
    expect(linkPatch('link', 'rome')).toEqual({ tripId: 'rome', tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false });
  });
  it('removing or undoing a link stops automatic matching for this booking', () => {
    expect(linkPatch('unlink')).toEqual({ tripId: null, tripLink: null, tripSuggestions: [], tripLinkDismissed: true });
    expect(linkPatch('undo')).toEqual(linkPatch('unlink'));
  });
  it('"Not for a trip" only dismisses (a free user may write it: tripId stays null)', () => {
    expect(linkPatch('not_for_trip')).toEqual({ tripSuggestions: [], tripLinkDismissed: true });
  });
});

describe('tripDateEyebrow', () => {
  it('formats like the trip eyebrow', () => {
    expect(tripDateEyebrow('2026-07-25', '2026-07-30')).toBe('JUL 25 – 30');
    expect(tripDateEyebrow('2026-07-30', '2026-08-02')).toBe('JUL 30 – AUG 2');
    expect(tripDateEyebrow(null, null)).toBe('DATES TBD');
  });
});

describe('draftPlaceFields', () => {
  it('maps a parsed flight to its place and local day', () => {
    expect(draftPlaceFields({ kind: 'boarding_pass', fields: { destinationCity: 'Rome', destinationCountryCode: 'it',
      originCountryCode: 'us', departureLocalDate: '2026-07-25' } } as never))
      .toEqual({ placeCity: 'Rome', placeCountryCode: 'IT', originCountryCode: 'US', localDate: '2026-07-25' });
  });
  it('maps a parsed reservation, dropping anything malformed', () => {
    expect(draftPlaceFields({ kind: 'reservation', reservationType: 'hotel', fields: { city: 'Roma', countryCode: 'Italy' } } as never))
      .toEqual({ placeCity: 'Roma' });
  });
});

describe('review fixes', () => {
  const { withoutDraftPlace, flightPlaceFields, isBannerFresh } = require('@/utils/walletLink');
  it('editing the city or the date drops what the import guessed for it', () => {
    const p = { placeCity: 'Roma', placeCountryCode: 'IT', originCountryCode: 'US', localDate: '2026-07-25' };
    expect(withoutDraftPlace(p, 'city')).toEqual({ originCountryCode: 'US', localDate: '2026-07-25' });
    expect(withoutDraftPlace(p, 'date')).toEqual({ placeCity: 'Roma', placeCountryCode: 'IT', originCountryCode: 'US' });
  });
  it('a flight edit rewrites its place and day from the form', () => {
    expect(flightPlaceFields(' Rome ', new Date(2026, 6, 25, 23, 30))).toEqual({ placeCity: 'Rome', localDate: '2026-07-25' });
    expect(flightPlaceFields('', null)).toEqual({ placeCity: null, localDate: null });
  });
  it('a banner from more than 10 seconds ago is stale', () => {
    expect(isBannerFresh(1000, 5000)).toBe(true);
    expect(isBannerFresh(1000, 12_000)).toBe(false);
  });
});

describe('draftPlaceFields — transit', () => {
  it('keeps a parsed train ticket\'s route, times and both cities', () => {
    expect(draftPlaceFields({ kind: 'reservation', reservationType: 'transit', fields: {
      title: 'ICE 918', city: 'Cologne', countryCode: 'de', originCity: 'Munich', originCountryCode: 'de',
      transitMode: 'train', operator: 'Deutsche Bahn', fromPlace: 'München Hbf', toPlace: 'Köln Messe/Deutz',
      departureLocalTime: '09:19', arrivalLocalTime: '13:29', seat: '55 (car 39)' } } as never))
      .toEqual({ placeCity: 'Cologne', placeCountryCode: 'DE', originCity: 'Munich', originCountryCode: 'DE',
        transitMode: 'train', operator: 'Deutsche Bahn', fromPlace: 'München Hbf', toPlace: 'Köln Messe/Deutz',
        departureLocalTime: '09:19', arrivalLocalTime: '13:29', seat: '55 (car 39)' });
  });
});

it('also reads a transit ticket the server handed over as an activity + transitMode', () => {
  expect(draftPlaceFields({ kind: 'reservation', reservationType: 'activity', fields: {
    title: 'ICE 918', transitMode: 'train', departureLocalTime: '09:19', originCity: 'Munich' } } as never))
    .toEqual({ transitMode: 'train', departureLocalTime: '09:19', originCity: 'Munich' });
});
