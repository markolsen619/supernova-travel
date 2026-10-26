/** A reviewed past-trip draft as the Firestore docs to write (spec 2026-10-25-past-trips-from-photos). */
import type { TripVisibility } from '@/types';
import { pastTripNights, type PastTripDraft } from '@/utils/pastTrip';
import { stopFallbackName } from '@/utils/pastTripPlaces';

export interface PastTripDocs {
  trip: { title: string; description: string; destination: Record<string, unknown>; additionalDestinations: Record<string, unknown>[]; startDay: string; endDay: string; visibility: TripVisibility };
  days: { key: string; dayNumber: number; destinationIndex: number; title: string; notes: string }[];
  stops: { key: string; dayKey: string; order: number; title: string; placeName: string | null; type: string; lat: number; lng: number; startTime: string; photoIds: string[] }[];
}

export function pastTripDocs(d: PastTripDraft, visibility: TripVisibility): PastTripDocs {
  const multi = d.cities.length > 1;
  const nights = multi ? pastTripNights(d.days.map((x) => x.city), d.cities.length) : [];
  const city = (i: number) => {
    const c = d.cities[i];
    const base = { name: c?.name || 'Somewhere', countryCode: c?.countryCode ?? null, lat: c?.lat ?? null, lng: c?.lng ?? null, placeId: '' };
    return multi ? { ...base, nights: nights[i] } : base;
  };
  let n = 0;
  const stops: PastTripDocs['stops'] = [];
  const days = d.days.map((day, i) => {
    const key = `d${i + 1}`;
    day.stops.forEach((s, j) => {
      stops.push({
        key: s.id, dayKey: key, order: j * 1000, title: s.name.trim() || stopFallbackName(n), placeName: s.placeName,
        type: s.type, lat: s.lat, lng: s.lng, startTime: s.time, photoIds: s.shownIds,
      });
      n++;
    });
    return { key, dayNumber: i + 1, destinationIndex: day.city, title: '', notes: day.caption.trim() };
  });
  return {
    trip: {
      title: d.title.trim() || `Trip to ${d.cities[0]?.name || 'somewhere'}`,
      description: d.description.trim(),
      destination: city(0),
      additionalDestinations: d.cities.slice(1).map((_, i) => city(i + 1)),
      startDay: d.days[0]?.day ?? '',
      endDay: d.days[d.days.length - 1]?.day ?? '',
      visibility,
    },
    days,
    stops,
  };
}

export function uploadQueue(docs: PastTripDocs, done: Set<string>): { stopKey: string; photoId: string }[] {
  return docs.stops.flatMap((s) => s.photoIds.filter((id) => !done.has(id)).map((photoId) => ({ stopKey: s.key, photoId })));
}
