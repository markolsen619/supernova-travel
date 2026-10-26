import { photoMeta } from '@/utils/photoMeta';

describe('photoMeta', () => {
  it('reads iOS picker EXIF (nested {Exif}/{GPS})', () => {
    const m = photoMeta({
      '{Exif}': { DateTimeOriginal: '2025:05:03 14:22:10', OffsetTimeOriginal: '+01:00' },
      '{GPS}': { Latitude: 38.7139, LatitudeRef: 'N', Longitude: 9.1335, LongitudeRef: 'W' },
    });
    expect(m).toEqual({ day: '2025-05-03', minutes: 14 * 60 + 22, lat: 38.7139, lng: -9.1335 });
  });
  it('reads Android picker EXIF (flat, rational GPS strings)', () => {
    const m = photoMeta({
      DateTimeOriginal: '2025:05:04 09:05:00',
      GPSLatitude: '38/1,42/1,5004/100', GPSLatitudeRef: 'N',
      GPSLongitude: '9/1,8/1,36/1', GPSLongitudeRef: 'W',
    });
    expect(m.day).toBe('2025-05-04');
    expect(m.minutes).toBe(9 * 60 + 5);
    expect(m.lat).toBeCloseTo(38.7139, 3);
    expect(m.lng).toBeCloseTo(-9.1433, 3);
  });
  it('reads flat decimal GPS numbers', () => {
    expect(photoMeta({ DateTimeOriginal: '2025:05:04 09:05:00', GPSLatitude: 51.5, GPSLatitudeRef: 'N', GPSLongitude: 0.12, GPSLongitudeRef: 'W' }).lng).toBeCloseTo(-0.12);
  });
  it('falls back to DateTime when DateTimeOriginal is missing', () => {
    expect(photoMeta({ DateTime: '2025:05:04 23:59:59' }).day).toBe('2025-05-04');
  });
  it('a screenshot (no EXIF) has nothing', () => {
    expect(photoMeta(null)).toEqual({ day: null, minutes: null, lat: null, lng: null });
    expect(photoMeta({})).toEqual({ day: null, minutes: null, lat: null, lng: null });
  });
  it('rejects 0,0 and out-of-range coordinates and malformed dates', () => {
    expect(photoMeta({ '{GPS}': { Latitude: 0, Longitude: 0 } }).lat).toBeNull();
    expect(photoMeta({ '{GPS}': { Latitude: 120, Longitude: 10 } }).lat).toBeNull();
    expect(photoMeta({ DateTimeOriginal: '0000:00:00 00:00:00' }).day).toBeNull();
    expect(photoMeta({ DateTimeOriginal: 'yesterday' }).day).toBeNull();
  });
});
