/**
 * "Make it yours" (owner, 2026-11-05): copy the places of a trip you can see into a new private trip of your own.
 * Copied: the cities with their nights, the days in order (titles) and each stop's place — name, type, Google place,
 * position and the search text that places it. Never copied: dates, times, notes, costs, booking codes, photos,
 * journals, visits, the description, and stops made from the author's own bookings (their flights and hotels).
 * Pure; services/tripCopy.ts writes it.
 */
import type { Destination, TripWithDays } from '@/types';

export interface CopiedStop {
  dayKey: string; order: number; type: string; title: string; titleSource: string;
  placeId: string | null; placeName: string | null; lat: number | null; lng: number | null; searchQuery: string | null;
}
export interface TripCopyDocs {
  trip: {
    title: string; description: string; destination: Destination; additionalDestinations: Destination[];
    visibility: 'private'; source: 'copy'; copiedFrom: { tripId: string; authorUid: string; authorName: string };
  };
  days: { key: string; dayNumber: number; destinationIndex: number; title: string; notes: string }[];
  stops: CopiedStop[];
}

const city = (d: Destination): Destination => ({
  name: d.name, placeId: d.placeId ?? null, lat: d.lat ?? null, lng: d.lng ?? null, countryCode: d.countryCode ?? null,
  bounds: d.bounds ?? null, ...(typeof d.nights === 'number' ? { nights: d.nights } : {}),
});

type AnyStop = Record<string, unknown> & { order?: number };

export function copyTripDocs(src: TripWithDays, opts: { authorName: string }): TripCopyDocs {
  const days = [...src.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const stops: CopiedStop[] = [];
  for (const day of days) {
    const acts = [...(day.activities as unknown as AnyStop[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    acts.filter((a) => !a.fromBooking).forEach((a, j) => {
      stops.push({
        dayKey: day.id, order: j * 1000, type: String(a.type ?? 'activity'), title: String(a.title ?? ''),
        titleSource: typeof a.titleSource === 'string' ? a.titleSource : 'user',
        placeId: typeof a.placeId === 'string' && a.placeId ? a.placeId : null,
        placeName: typeof a.placeName === 'string' ? a.placeName : null,
        lat: typeof a.lat === 'number' ? a.lat : null, lng: typeof a.lng === 'number' ? a.lng : null,
        searchQuery: typeof a.searchQuery === 'string' ? a.searchQuery : null,
      });
    });
  }
  return {
    trip: {
      title: src.title, description: '', destination: city(src.destination),
      additionalDestinations: (src.additionalDestinations ?? []).map(city),
      visibility: 'private', source: 'copy',
      copiedFrom: { tripId: src.id, authorUid: src.authorUid, authorName: opts.authorName },
    },
    days: days.map((d) => ({ key: d.id, dayNumber: d.dayNumber, destinationIndex: d.destinationIndex ?? 0, title: d.title ?? '', notes: '' })),
    stops,
  };
}

/** Someone else's trip, not hidden, with at least one day to copy. */
export function canCopyTrip(t: TripWithDays & { moderationHidden?: boolean }, viewerUid: string | null): boolean {
  return !!viewerUid && t.authorUid !== viewerUid && t.moderationHidden !== true && t.days.length > 0;
}
