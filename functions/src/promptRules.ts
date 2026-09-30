import type { GenerateTripRequest } from './types';

/**
 * Pure pieces of the Gemini prompt. Imports no firebase-admin, so the rules
 * that shape every itinerary can be unit-tested (see
 * __tests__/functions/promptRules.test.ts).
 */

type TravelStyle = GenerateTripRequest['travelStyle'];

export const STYLE_RULES: Record<TravelStyle, string> = {
  adventure: 'Prioritize outdoor and active experiences (hiking, water sports, nature, thrill activities) over museums or shopping.',
  luxury: 'Favor fine dining, premium/private experiences, and upscale venues. Avoid budget language like "cheap" or "free walking tour".',
  budget: 'Favor free or low-cost activities, casual local eateries, and public transport. Avoid luxury/fine-dining language.',
  family: 'Favor kid-friendly venues and gentler pacing (shorter walks, earlier bedtimes, no late-night or adult-oriented activities).',
  cultural: 'Prioritize museums, historic sites, and local traditions over shopping, nightlife, or generic tourist attractions.',
};

function isTravelStyle(v: unknown): v is TravelStyle {
  return typeof v === 'string' && v in STYLE_RULES;
}

/**
 * The styles to plan for. A current client sends `travelStyles`; an older
 * one sends only `travelStyle`, so that is the fallback. Never empty.
 */
export function resolveTravelStyles(data: Pick<GenerateTripRequest, 'travelStyle' | 'travelStyles'>): TravelStyle[] {
  const listed = [...new Set((data.travelStyles ?? []).filter(isTravelStyle))];
  if (listed.length > 0) return listed;
  return [isTravelStyle(data.travelStyle) ? data.travelStyle : 'adventure'];
}

/** "adventure-style", "family and cultural-style" — for the prompt's first line. */
export function travelStyleSummary(styles: TravelStyle[]): string {
  if (styles.length === 1) return `${styles[0]}-style`;
  return `${styles.slice(0, -1).join(', ')} and ${styles[styles.length - 1]}-style`;
}

export function travelStyleRules(styles: TravelStyle[]): string {
  if (styles.length === 1) return `Travel style rule for this trip: ${STYLE_RULES[styles[0]]}`;
  return [
    'Travel style rules for this trip — the traveler picked several, so blend them across each day rather than alternating whole days, and where two conflict, find the option that satisfies both:',
    ...styles.map((s) => `- ${s}: ${STYLE_RULES[s]}`),
  ].join('\n');
}

/**
 * Makes hotels, restaurants and bars name a real place. Without this Gemini
 * wrote "Hotel Check-in: Mission Beach" with a searchQuery of "Hotels near
 * Mission Beach" — the map then grounded to an arbitrary hotel, the timeline
 * never said which, and the Booking.com hand-off searched for the title.
 */
export const VENUE_NAMING_RULES = `- Every hotel, restaurant, bar and cafe must be a specific, real, currently operating venue that fits the travel style — never a category like "a local taqueria" or "hotels near the beach"
- Put that venue's name in the activity title, phrased as what the traveler does there: "Check into Hyatt Regency Mission Bay", "Dinner at STK for steaks", "Drinks at Waterbar", "Check out of Hyatt Regency Mission Bay"
- Its searchQuery must be the venue's name plus its city, e.g. "Hyatt Regency Mission Bay, San Diego"
- Use the same hotel for check-in and check-out unless the traveler changes city
- Give bars, pubs and cafes the "restaurant" type`;
