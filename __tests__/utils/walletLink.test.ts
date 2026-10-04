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
