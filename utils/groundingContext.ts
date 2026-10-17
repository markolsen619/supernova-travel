/** Where a day's stops are searched: shared by the trip page's grounding pass and Nova. Pure. */
import type { GroundingContext } from '@/services/places/groundStop';
import { bboxCenter, boundsToBbox } from '@/utils/geoBounds';
import type { Destination } from '@/types';

export function destinationAt(trip: { destination: Destination; additionalDestinations: Destination[] }, index: number): Destination {
  return index === 0 ? trip.destination : (trip.additionalDestinations[index - 1] ?? trip.destination);
}

/** Box + centre; the centre falls back to the destination point so a search is never unbiased (the La Paz bug). */
export function groundingContextFor(dest: Destination): GroundingContext {
  const bbox = boundsToBbox(dest.bounds);
  const center = bbox != null ? bboxCenter(bbox) : dest.lat != null && dest.lng != null ? { lat: dest.lat, lng: dest.lng } : null;
  return { bbox, center };
}
