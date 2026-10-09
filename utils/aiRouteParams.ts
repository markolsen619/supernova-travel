import type { TravelStyle } from '@/types/ai';
import type { TripVisibility } from '@/types';

/**
 * Reads the AI generator's request back out of route params (ai-generate
 * pushes ai-generating with everything as strings).
 */

export const TRAVEL_STYLE_VALUES: readonly TravelStyle[] = ['adventure', 'luxury', 'budget', 'family', 'cultural', 'party', 'relax', 'foodie', 'romantic'];

function isTravelStyle(v: string): v is TravelStyle {
  return (TRAVEL_STYLE_VALUES as readonly string[]).includes(v);
}

/**
 * Reads the comma-joined `travelStyles` route param back into a list. Unknown
 * or repeated values are dropped, and an empty result falls back to the
 * single legacy `travelStyle` param (then 'adventure'), so the generator
 * always has at least one style to work with.
 */
export function parseTravelStyles(joined: string | undefined, legacy?: string): TravelStyle[] {
  const styles = [...new Set((joined ?? '').split(',').map((s) => s.trim()).filter(isTravelStyle))];
  if (styles.length > 0) return styles;
  return [legacy && isTravelStyle(legacy) ? legacy : 'adventure'];
}

/** The picked visibility, or Followers — the AI form's own default. */
export function parseTripVisibility(param: string | undefined): TripVisibility {
  return param === 'public' || param === 'followers' || param === 'private' ? param : 'followers';
}
