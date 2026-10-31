/**
 * Adult and gambling places are opt-in (owner, 2026-10-30): a user got a strip club they never asked for. Trip
 * generation and Nova leave out strip clubs and adult shows, red-light and sex tourism, cannabis venues and
 * casinos unless the traveler's own words ask for them ("bachelor party", "casino night", "coffeeshop"). Picking the
 * Party style alone doesn't count. The prompts say so; this is the safety net after the model answers. Pure.
 */

export type AdultCategory = 'strip' | 'redlight' | 'cannabis' | 'casino';

const PLACE_PATTERNS: Record<AdultCategory, RegExp[]> = {
  strip: [/\bstrip ?clubs?\b/, /\bgentlem[ae]n'?s'? club/, /\bgo-?go bars?\b/, /\blap ?dances?\b/, /\bpeep shows?\b/, /\b(sex|erotic|adult) shows?\b/, /\badult entertainment\b/, /\btopless bars?\b/],
  redlight: [/\bred[- ]light\b/, /\bbrothels?\b/, /\bbordellos?\b/, /\bsex shops?\b/, /\b(sex|erotic) museum\b/, /\bmuseum of sex\b/],
  cannabis: [/\bcoffeeshops?\b/, /\bcannabis\b/, /\bmarihuana\b/, /\bmarijuana\b/, /\bdispensar(y|ies)\b/, /\bweed (tour|tasting|shop|caf)/],
  casino: [/\bcasinos?\b/, /\bgambling\b/, /\bpoker rooms?\b/, /\bslot machines?\b/],
};

const ASK_PATTERNS: Record<AdultCategory, RegExp[]> = {
  strip: [/\bstrip ?clubs?\b/, /\bgentlem[ae]n'?s'? club/, /\bbachelor(ette)?\b/, /\bstag (do|party|weekend)\b/, /\b(adult|burlesque) shows?\b/],
  redlight: [/\bred[- ]light\b/, /\bsex shops?\b/, /\b(sex|erotic) museum\b/, /\bbrothels?\b/],
  cannabis: [/\bcoffeeshops?\b/, /\bcannabis\b/, /\bmarijuana\b/, /\bweed\b/, /\bdispensar(y|ies)\b/, /\b420\b/],
  casino: [/\bcasinos?\b/, /\bgambl(e|ing)\b/, /\bpoker\b/, /\bblackjack\b/, /\broulette\b/, /\bslots\b/],
};

const CATEGORIES = Object.keys(PLACE_PATTERNS) as AdultCategory[];
const STAY = /^\s*check (into|out of)\b/i;

/** The adult category a stop falls in, or null. A hotel stay never counts (a Vegas hotel may be a casino resort). */
export function adultCategory(a: { title?: string | null; searchQuery?: string | null; type?: string | null }): AdultCategory | null {
  if (a.type === 'hotel' || STAY.test(a.title ?? '')) return null;
  const text = `${a.title ?? ''} ${a.searchQuery ?? ''}`.toLowerCase();
  return CATEGORIES.find((c) => PLACE_PATTERNS[c].some((re) => re.test(text))) ?? null;
}

/** The categories the traveler's own words ask for (preferences, must-sees, a Nova message). */
export function allowedCategories(text: string | null | undefined): Set<AdultCategory> {
  const t = (text ?? '').toLowerCase();
  return new Set(CATEGORIES.filter((c) => ASK_PATTERNS[c].some((re) => re.test(t))));
}

export function keepActivity(a: { title?: string | null; searchQuery?: string | null; type?: string | null }, allowed: Set<AdultCategory>): boolean {
  const c = adultCategory(a);
  return c === null || allowed.has(c);
}

/** The prompt rule, shared by trip generation and Nova. */
export const ADULT_VENUE_RULE = 'Never include strip clubs or adult shows, red-light districts, brothels or sex shops, cannabis coffeeshops or dispensaries, or casinos and gambling unless the traveler\'s own words ask for them (for example "bachelor party", "casino night", "a coffeeshop"). A party or nightlife style alone is not asking: give it bars, clubs and live music instead.';

/** A generated trip without the adult stops its request didn't ask for; `removed` counts them (for the log). */
export function withoutUnasked<T extends { days: { activities: { title?: string | null; searchQuery?: string | null; type?: string | null }[] }[] }>(
  trip: T, requestText: string,
): { trip: T; removed: number } {
  const allowed = allowedCategories(requestText);
  let removed = 0;
  const days = trip.days.map((d) => {
    const activities = d.activities.filter((a) => keepActivity(a, allowed) || (removed++, false));
    return { ...d, activities };
  });
  return { trip: { ...trip, days }, removed };
}
