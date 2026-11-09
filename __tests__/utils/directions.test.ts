import { appleMapsUrl, googleMapsUrl } from '@/utils/directions';

describe('directions links (owner, 2026-11-08: Open in Maps)', () => {
  const p = { name: 'Sensō-ji', lat: 35.7148, lng: 139.7967, placeId: 'ChIJ8T1GpMGOGGARDYGSgpooDWw' };
  it('Apple Maps: directions to the position, labelled with the name', () => {
    expect(appleMapsUrl(p)).toBe('https://maps.apple.com/?daddr=35.7148,139.7967&q=Sens%C5%8D-ji');
  });
  it('Google Maps: the universal directions link, with the Google place when we have one', () => {
    expect(googleMapsUrl(p)).toBe('https://www.google.com/maps/dir/?api=1&destination=35.7148%2C139.7967&destination_place_id=ChIJ8T1GpMGOGGARDYGSgpooDWw');
    expect(googleMapsUrl({ ...p, placeId: null })).toBe('https://www.google.com/maps/dir/?api=1&destination=35.7148%2C139.7967');
  });
});
