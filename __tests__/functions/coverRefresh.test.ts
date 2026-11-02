import { parsePlacesPhotoUrl, photoUrlFrom, needsRefresh, firstPhotoName, REFRESH_AFTER_MS } from '../../functions/src/coverRefresh';

const URL_ = 'https://places.googleapis.com/v1/places/ChIJO_PkYRozGQ0R0DaQ5L3rAAQ/photos/Aa-ngMbc_x-9/media?maxWidthPx=1200&key=AIzaTEST';

describe('parsePlacesPhotoUrl', () => {
  it('reads the place, photo, width and key from a stored cover', () => {
    expect(parsePlacesPhotoUrl(URL_)).toEqual({ placeId: 'ChIJO_PkYRozGQ0R0DaQ5L3rAAQ', key: 'AIzaTEST', maxWidthPx: 1200 });
  });
  it('anything else is not ours to refresh', () => {
    expect(parsePlacesPhotoUrl('https://lh3.googleusercontent.com/p/x')).toBeNull();
    expect(parsePlacesPhotoUrl('https://places.googleapis.com/v1/places/X/photos/Y/media')).toBeNull(); // no key
    expect(parsePlacesPhotoUrl('not a url')).toBeNull();
    expect(parsePlacesPhotoUrl(null)).toBeNull();
  });
});

describe('photoUrlFrom', () => {
  it('builds the same kind of URL the app already loads', () => {
    expect(photoUrlFrom('places/P/photos/NEW', 'AIzaTEST', 1200)).toBe('https://places.googleapis.com/v1/places/P/photos/NEW/media?maxWidthPx=1200&key=AIzaTEST');
  });
});

describe('needsRefresh', () => {
  const now = 100 * 86_400_000;
  it('never refreshed or older than 20 days: yes', () => {
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh(now - REFRESH_AFTER_MS - 1, now)).toBe(true);
  });
  it('refreshed recently: no', () => {
    expect(needsRefresh(now - 86_400_000, now)).toBe(false);
  });
});

describe('firstPhotoName', () => {
  it('the place\'s first photo, else null', () => {
    expect(firstPhotoName({ photos: [{ name: 'places/P/photos/A' }, { name: 'places/P/photos/B' }] })).toBe('places/P/photos/A');
    expect(firstPhotoName({ photos: [] })).toBeNull();
    expect(firstPhotoName(null)).toBeNull();
    expect(firstPhotoName({ photos: [{ name: 'evil/../x' }] })).toBeNull();
  });
});

// 2026-11-01 bill: 7,428 Place Photo loads in October, all from apps drawing keyed media URLs. Covers now store
// Google's key-less photoUri (one billed lookup per refresh, free to view) plus the place id to refresh it by.
import { coverPlaceId, coverDue, photoUriRequest, photoUriFrom, PHOTO_URI_REFRESH_MS } from '../../functions/src/coverRefresh';

describe('photo URI covers', () => {
  const uri = 'https://lh3.googleusercontent.com/place-photos/AJnk2cx=s1600-w1200';
  it('finds the place to refresh by: saved coverPlaceId, else the keyed URL', () => {
    expect(coverPlaceId({ coverImageUrl: uri, coverPlaceId: 'ChIJabc' })).toBe('ChIJabc');
    expect(coverPlaceId({ coverImageUrl: URL_ })).toBe('ChIJO_PkYRozGQ0R0DaQ5L3rAAQ');
    expect(coverPlaceId({ coverImageUrl: uri })).toBeNull();
    expect(coverPlaceId({ coverImageUrl: 'https://firebasestorage.googleapis.com/x.jpg' })).toBeNull();
  });
  it('a keyed URL is always due (it bills every view); a photo URI after 10 days', () => {
    const now = 1_800_000_000_000;
    expect(coverDue({ coverImageUrl: URL_, coverRefreshedAtMs: now }, now)).toBe(true);
    expect(coverDue({ coverImageUrl: uri, coverPlaceId: 'ChIJabc', coverRefreshedAtMs: now - PHOTO_URI_REFRESH_MS + 1 }, now)).toBe(false);
    expect(coverDue({ coverImageUrl: uri, coverPlaceId: 'ChIJabc', coverRefreshedAtMs: now - PHOTO_URI_REFRESH_MS - 1 }, now)).toBe(true);
    expect(coverDue({ coverImageUrl: uri }, now)).toBe(false);
    expect(PHOTO_URI_REFRESH_MS).toBe(10 * 86_400_000);
  });
  it('asks Google for the key-less address, and only accepts an https googleusercontent one', () => {
    expect(photoUriRequest('places/P/photos/R', 'K', 1200)).toBe('https://places.googleapis.com/v1/places/P/photos/R/media?maxWidthPx=1200&skipHttpRedirect=true&key=K');
    expect(photoUriFrom({ name: 'x', photoUri: uri })).toBe(uri);
    expect(photoUriFrom({ photoUri: 'http://lh3.googleusercontent.com/a' })).toBeNull();
    expect(photoUriFrom({ photoUri: 'https://evil.example.com/a' })).toBeNull();
    expect(photoUriFrom({ photoUri: 'https://places.googleapis.com/v1/x?key=K' })).toBeNull();
    expect(photoUriFrom(null)).toBeNull();
  });
});
