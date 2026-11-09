import { photoUriRequestUrl, parsePhotoUri, freshPhotoUris, PHOTO_RAIL_MAX, PHOTO_URI_TTL_MS } from '@/utils/placePhotos';

const uri = 'https://lh3.googleusercontent.com/place-photos/AJnk2cx=s1600-w600';

describe('placePhotos', () => {
  it('requests the key-less photo address', () => {
    expect(photoUriRequestUrl('places/P/photos/R', 600, 'K')).toBe('https://places.googleapis.com/v1/places/P/photos/R/media?maxWidthPx=600&skipHttpRedirect=true&key=K');
  });
  it('accepts only an https googleusercontent address', () => {
    expect(parsePhotoUri({ photoUri: uri })).toBe(uri);
    expect(parsePhotoUri({ photoUri: 'https://example.com/a.jpg' })).toBeNull();
    expect(parsePhotoUri({})).toBeNull();
  });
  it('reuses cached addresses for 10 days, never an empty list', () => {
    const now = 1_800_000_000_000;
    expect(freshPhotoUris({ photoUris: [uri], photoUrisAtMs: now - 1000 }, now)).toEqual([uri]);
    expect(freshPhotoUris({ photoUris: [uri], photoUrisAtMs: now - PHOTO_URI_TTL_MS - 1 }, now)).toBeNull();
    expect(freshPhotoUris({ photoUris: [], photoUrisAtMs: now }, now)).toBeNull();
    expect(freshPhotoUris(null, now)).toBeNull();
    expect(freshPhotoUris({ photoUris: ['https://example.com/a'], photoUrisAtMs: now }, now)).toBeNull();
  });
  it('shows at most 4 photos on the place sheet', () => {
    expect(PHOTO_RAIL_MAX).toBe(4);
  });
});

it('freshPhotoUris keeps empty slots for photos that failed, so credits stay lined up (final review)', () => {
  const now = 1_800_000_000_000;
  expect(freshPhotoUris({ photoUris: ['', uri], photoUrisAtMs: now }, now)).toEqual(['', uri]);
  expect(freshPhotoUris({ photoUris: ['', ''], photoUrisAtMs: now }, now)).toBeNull();
});
