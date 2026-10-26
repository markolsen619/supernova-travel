import { buildPastTrip, type PickedPhoto } from '@/utils/pastTrip';
import { pastTripDocs, uploadQueue } from '@/utils/pastTripDocs';

const p = (id: string, day: string, hhmm: string, lat: number, lng: number): PickedPhoto => ({ id, uri: `file://${id}`, meta: { day, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), lat, lng } });
const named = (d: ReturnType<typeof buildPastTrip>) => ({
  ...d, title: 'Lisbon and Porto',
  cities: d.cities.map((c, i) => ({ ...c, name: i ? 'Porto' : 'Lisbon', countryCode: 'PT' })),
  days: d.days.map((day) => ({ ...day, caption: day.stops.length ? 'A good day' : '', stops: day.stops.map((s) => ({ ...s, name: `Place ${s.id}` })) })),
});

describe('pastTripDocs', () => {
  it('one day in one city: no nights, start = end', () => {
    const docs = pastTripDocs(named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13)])), 'followers');
    expect(docs.trip.startDay).toBe('2025-05-03');
    expect(docs.trip.endDay).toBe('2025-05-03');
    expect(docs.trip.destination).not.toHaveProperty('nights');
    expect(docs.trip.additionalDestinations).toEqual([]);
    expect(docs.trip.visibility).toBe('followers');
  });
  it('two cities: nights on each, days numbered with their city, stops ordered with their times', () => {
    const d = named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13), p('b', '2025-05-03', '12:00', 38.71, -9.145), p('c', '2025-05-05', '10:00', 41.1496, -8.611)]));
    const docs = pastTripDocs(d, 'public');
    expect(docs.trip.destination).toMatchObject({ name: 'Lisbon', countryCode: 'PT', nights: 2, placeId: '' });
    expect(docs.trip.additionalDestinations).toEqual([expect.objectContaining({ name: 'Porto', nights: 0 })]);
    expect(docs.days.map((x) => [x.dayNumber, x.destinationIndex, x.notes])).toEqual([[1, 0, 'A good day'], [2, 0, ''], [3, 1, 'A good day']]);
    expect(docs.stops.map((s) => [s.dayKey, s.order, s.startTime])).toEqual([['d1', 0, '10:00'], ['d1', 1000, '12:00'], ['d3', 0, '10:00']]);
  });
  it('a stop uploads only its shown photos (≤ 10)', () => {
    const d = named(buildPastTrip(Array.from({ length: 12 }, (_, i) => p(`x${i}`, '2025-05-03', `10:${String(i).padStart(2, '0')}`, 38.7115, -9.13))));
    expect(pastTripDocs(d, 'private').stops[0].photoIds).toHaveLength(10);
  });
  it('the upload queue skips what is already done (a retry never uploads twice)', () => {
    const d = named(buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13), p('b', '2025-05-03', '10:05', 38.7115, -9.13)]));
    const docs = pastTripDocs(d, 'private');
    expect(uploadQueue(docs, new Set()).map((q) => q.photoId)).toEqual(['a', 'b']);
    expect(uploadQueue(docs, new Set(['a'])).map((q) => q.photoId)).toEqual(['b']);
  });
  it('a stop never saves with an empty title', () => {
    const d = buildPastTrip([p('a', '2025-05-03', '10:00', 38.7115, -9.13)]);
    expect(pastTripDocs(d, 'private').stops[0].title).toBe('Stop 1');
  });
});
