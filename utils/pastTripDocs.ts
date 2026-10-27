/** A reviewed past-trip draft as the Firestore docs to write (spec 2026-10-25-past-trips-from-photos). */
import type { TripVisibility } from '@/types';
import { pastTripNights, type PastTripDraft } from '@/utils/pastTrip';
import { stopFallbackName } from '@/utils/pastTripPlaces';

export interface PastTripDocs {
  trip: { title: string; description: string; destination: Record<string, unknown>; additionalDestinations: Record<string, unknown>[]; startDay: string; endDay: string; visibility: TripVisibility };
  days: { key: string; dayNumber: number; destinationIndex: number; title: string; notes: string }[];
  stops: { key: string; dayKey: string; order: number; title: string; placeName: string | null; type: string; lat: number; lng: number; startTime: null; photoIds: string[] }[];
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
        // No times: people want to see where someone went, not when (owner, 2026-10-26); `order` keeps the sequence.
        type: s.type, lat: s.lat, lng: s.lng, startTime: null, photoIds: s.shownIds,
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

/**
 * The work left per stop, in stop order (final review I1): photos not yet uploaded, and stops whose journal entry
 * still has to be written. Each stop's journal is written as soon as its photos are up, so a phone that dies at 95 %
 * leaves every finished stop with its photos.
 */
export function stopUploads(docs: PastTripDocs, uploaded: Set<string>, journalPending: Set<string>): { stopKey: string; photoIds: string[] }[] {
  return docs.stops
    .map((s) => ({ stopKey: s.key, photoIds: s.photoIds.filter((id) => !uploaded.has(id)) }))
    .filter((s) => s.photoIds.length > 0 || journalPending.has(s.stopKey));
}

/** What the finish screen reports as "didn't upload": failed photos plus the photos of stops not yet written. */
export function unfinishedPhotos(s: { failed: { stopKey: string; photoId: string }[]; journalPending: string[] }, docs: PastTripDocs): number {
  const ids = new Set(s.failed.map((f) => f.photoId));
  for (const key of s.journalPending) for (const id of docs.stops.find((x) => x.key === key)?.photoIds ?? []) ids.add(id);
  return ids.size;
}

/** The finish screen's primary action: the video needs ≥ 2 placed stops and the recorder (TripMapView canRecord). */
export function finishPrimary(placedStops: number, recorderAvailable: boolean): 'video' | 'view' {
  return recorderAvailable && placedStops >= 2 ? 'video' : 'view';
}
