/**
 * Bookable tours and tickets for sights (owner, 2026-11-01): a commission (~8%) when someone books, nothing extra
 * for them. Viator in the US, Canada and Mexico, where its inventory is strongest; GetYourGuide everywhere else.
 * A search link carrying our affiliate ids and an app campaign tag — only the place's name ever leaves the app.
 * Without ids the links still work, they just earn nothing (as Booking.com's). Pure.
 */
export type ActivityPartner = 'getyourguide' | 'viator';
export interface PartnerIds { gygPartnerId: string | null; viatorPid: string | null; viatorMcid: string | null }

const VIATOR_COUNTRIES = new Set(['US', 'CA', 'MX']);
export const PARTNER_NAME: Record<ActivityPartner, string> = { getyourguide: 'GetYourGuide', viator: 'Viator' };

export const activityPartner = (countryCode: string | null | undefined): ActivityPartner =>
  countryCode && VIATOR_COUNTRIES.has(countryCode.toUpperCase()) ? 'viator' : 'getyourguide';

/** The ids from the build's settings (EXPO_PUBLIC_*), null until the accounts exist. */
export function partnerIdsFromEnv(env: Record<string, string | undefined>): PartnerIds {
  const v = (k: string) => (env[k] && env[k]!.trim() ? env[k]!.trim() : null);
  return { gygPartnerId: v('EXPO_PUBLIC_GYG_PARTNER_ID'), viatorPid: v('EXPO_PUBLIC_VIATOR_PID'), viatorMcid: v('EXPO_PUBLIC_VIATOR_MCID') };
}

function searchUrl(text: string, partner: ActivityPartner, ids: PartnerIds): string {
  if (partner === 'viator') {
    const p = new URLSearchParams({ text });
    if (ids.viatorPid) p.set('pid', ids.viatorPid);
    if (ids.viatorMcid) p.set('mcid', ids.viatorMcid);
    p.set('medium', 'link');
    p.set('campaign', 'supernova-app');
    return `https://www.viator.com/searchResults/all?${p.toString()}`;
  }
  const p = new URLSearchParams({ q: text });
  if (ids.gygPartnerId) p.set('partner_id', ids.gygPartnerId);
  p.set('cmp', 'supernova-app');
  return `https://www.getyourguide.com/s/?${p.toString()}`;
}

export function activityPartnerUrl(place: { name: string; near: string | null; countryCode: string | null }, ids: PartnerIds): string {
  const name = place.name.trim(), city = place.near?.trim();
  const text = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
  return searchUrl(text, activityPartner(place.countryCode), ids);
}

export const thingsToDoUrl = (city: string, countryCode: string | null, ids: PartnerIds) =>
  searchUrl(city.trim(), activityPartner(countryCode), ids);

/** Google place types worth tickets or a tour (the globe's sheet has no stop type, only Google's). */
const SIGHTS = new Set([
  'tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'aquarium', 'zoo', 'historical_landmark', 'national_park',
  'park', 'church', 'hindu_temple', 'mosque', 'synagogue', 'monument', 'cultural_landmark', 'performing_arts_theater',
  'stadium', 'water_park', 'castle', 'landmark', 'botanical_garden', 'wildlife_park', 'observation_deck',
]);
export const isSightType = (primaryType: string | null | undefined) => !!primaryType && SIGHTS.has(primaryType);
