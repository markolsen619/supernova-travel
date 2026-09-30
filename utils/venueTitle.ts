import type { ActivityType } from '@/types';

/**
 * Turns a generic AI stop title into one that names where it is, once the
 * stop has been grounded to a real business: "Dinner: Seafood by the Bay"
 * becomes "Dinner at The Fish Market".
 *
 * Needed because AI stops often arrive as a category — "Hotels near Mission
 * Beach" — and grounding picks a real place for them without the timeline
 * ever saying which. The prompt now asks Gemini for named venues
 * (functions/src/promptRules.ts); this covers the ones it still leaves vague.
 *
 * Returns null when there is nothing to change: not a hotel, restaurant or
 * bar, or the title already contains the name.
 */
export function venueTitle(
  activity: { type: ActivityType; title: string },
  placeName: string,
): string | null {
  const name = placeName.trim();
  if (!name) return null;

  const title = activity.title;
  if (alreadyNamed(title, name)) return null;

  if (activity.type === 'hotel') {
    if (/check.?out/i.test(title)) return `Check out of ${name}`;
    if (/check.?in|arriv/i.test(title)) return `Check into ${name}`;
    return `Stay at ${name}`;
  }

  if (activity.type === 'restaurant') {
    const meal = mealWord(title);
    return meal ? `${meal} at ${name}` : `Eat at ${name}`;
  }

  // Gemini files bars under "activity" as often as "restaurant".
  if (activity.type === 'activity' && DRINKS.test(title)) return `Drinks at ${name}`;

  return null;
}

const LEADING_ARTICLES = new Set(['the', 'a', 'an', 'la', 'le', 'el', 'los', 'las', 'il']);

/**
 * Whether the title already names this place. Compared on the name's first
 * distinctive word, not the whole name: Google often appends a branch or city
 * ("STK San Diego" for "Dinner at STK"), and area words a hotel shares with
 * its neighborhood ("Mission" in both Hyatt Regency Mission Bay and "Hotel
 * Check-in: Mission Beach") must not count as a match.
 */
function alreadyNamed(title: string, name: string): boolean {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes(name.toLowerCase())) return true;
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const key = words.find((w) => !LEADING_ARTICLES.has(w)) ?? words[0];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'u').test(lowerTitle);
}

const DRINKS = /\b(drinks?|bars?|pubs?|brewery|cocktails?|wine|beers?)\b/i;

function mealWord(title: string): string | null {
  if (/\bbreakfast\b/i.test(title)) return 'Breakfast';
  if (/\bbrunch\b/i.test(title)) return 'Brunch';
  if (/\blunch\b/i.test(title)) return 'Lunch';
  if (/\bdinner|supper\b/i.test(title)) return 'Dinner';
  if (/\b(coffee|caf[eé])\b/i.test(title)) return 'Coffee';
  if (DRINKS.test(title)) return 'Drinks';
  return null;
}

/**
 * Whether Google place `types` describe a business rather than an area. A
 * category search can resolve to a neighborhood ("Mission Beach"), and
 * "Check into Mission Beach" would be worse than the generic title.
 */
export function isVenueTypes(types: string[] | undefined | null): boolean {
  if (!types) return false;
  return types.includes('establishment') && !types.includes('political');
}
