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
