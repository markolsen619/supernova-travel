import type { TripActivity } from '@/types';
import type { EnrichedPlace } from '@/stores/usePlacesStore';

/**
 * Turning an itinerary stop into something PlaceDetailSheet can render.
 *
 * The sheet already exists and already does the expensive, careful part —
 * photo rail, rating, price level, opening hours, and its own tier1 -> tier2
 * upgrade on open. It was only ever mounted on the globe and in AddStopSheet.
 * Tapping an activity used to fly the map to a pin instead, which is how a
 * trip full of hand-picked places ended up looking like circles on a map.
 *
 * This is the whole adapter. Everything else is wiring.
 */

/**
 * Whether this stop has enough to open the sheet at all.
 *
 * Grounded means "has coordinates", not "has a Google place" — mirroring
 * TripMapView's collectStops predicate. A Mapbox-grounded stop has no
 * placeId but still has a name, an address and a location worth showing;
 * it just cannot fetch photos. An ungrounded stop has nothing, and must
 * fall through to the existing grounding flow.
 */
export function canShowPlaceSheet(activity: TripActivity): boolean {
  return activity.lat != null && activity.lng != null;
}

/**
 * A tier1 seed for the sheet, or null when the stop isn't grounded.
 *
 * Deliberately tier1 even though some fields are known: PlaceDetailSheet
 * upgrades a tier1 place to tier2 when it opens, and claiming tier2 here
 * would suppress that and leave the photo rail permanently empty.
 *
 * placeId falls back to '' rather than null so the sheet attempts no Places
 * call for a Mapbox stop — enrichPlaceById would 404 on a Mapbox id, and
 * readCachedPlace short-circuits on an empty id too.
 */
export function activityToPlace(activity: TripActivity): EnrichedPlace | null {
  if (!canShowPlaceSheet(activity)) return null;

  return {
    placeId: activity.placeId ?? '',
    name: activity.title,
    address: activity.address ?? '',
    lat: activity.lat as number,
    lng: activity.lng as number,
    countryCode: null,
    tier: 'tier1',
  };
}
