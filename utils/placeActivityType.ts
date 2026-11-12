import type { ActivityType } from '@/types';

/**
 * The stop type for a place picked by search (2026-11-11): Google's own type decides, so a hotel added by name is a
 * hotel stop — saved as a sight, it got a Tickets link and counted in the "still need tickets" reminder. Google's
 * primary type decides when there is one (a hotel lists its restaurant, a museum its café); without one, the first
 * recognised type in Google's order. Anything
 * else stays a sightseeing stop. Only the six stored types are returned (Architecture Rule 11).
 */
const STAY = new Set(['lodging', 'hotel', 'motel', 'hostel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'inn', 'extended_stay_hotel', 'cottage', 'farmstay', 'japanese_inn', 'budget_japanese_inn', 'private_guest_room']);
const FOOD = new Set(['restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'wine_bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'food_court', 'ice_cream_shop', 'dessert_shop', 'tea_house', 'bar_and_grill', 'brewery', 'night_club_restaurant']);
const STATION = new Set(['train_station', 'transit_station', 'bus_station', 'subway_station', 'light_rail_station', 'ferry_terminal', 'airport', 'international_airport', 'bus_stop']);

function typeOf(t: string): ActivityType | null {
  if (STAY.has(t)) return 'hotel';
  if (FOOD.has(t) || t.endsWith('_restaurant')) return 'restaurant';
  if (STATION.has(t)) return 'transport';
  return null;
}

export function activityTypeForPlace(place: { primaryType?: string | null; types?: string[] | null }): ActivityType {
  if (place.primaryType) return typeOf(place.primaryType) ?? 'activity';
  for (const t of place.types ?? []) {
    const found = typeOf(t);
    if (found) return found;
  }
  return 'activity';
}
