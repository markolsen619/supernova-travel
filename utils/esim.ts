import { COUNTRY_INFO } from '@/constants/countryInfo';
import { internationalCountries, tripCountries, type CountryTrip } from '@/utils/beforeYouGo';
import { tripSpan, type SpanTrip } from '@/utils/homeState';
import { addDays } from '@/utils/pastTrip';
import { applyTemplate, type LinkTemplates } from '@/utils/partnerLinks';

/** eSIMs (spec 2026-11-12): Airalo's country page, and Home's line in the week before an international trip. Pure. */
export function airaloUrl(code: string, templates: LinkTemplates): string | null {
  const slug = COUNTRY_INFO[code]?.airaloSlug;
  return slug ? applyTemplate(`https://www.airalo.com/${slug}`, templates.airalo) : null;
}

export function esimHomeLine(
  trip: CountryTrip & SpanTrip & { id: string }, today: string, isMember: boolean, home: string | null, dismissed: boolean,
): { label: string; firstCountry: string } | null {
  if (!isMember || dismissed) return null;
  const { start, end } = tripSpan(trip);
  if (!start || start > addDays(today, 7) || (end ?? start) < today) return null;
  const sold = internationalCountries(tripCountries(trip), home).filter((c) => COUNTRY_INFO[c]?.airaloSlug);
  if (sold.length === 0) return null;
  const more = sold.length - 1;
  return { label: `Staying connected? eSIMs for ${COUNTRY_INFO[sold[0]].name}${more > 0 ? ` and ${more} more` : ''}`, firstCountry: sold[0] };
}
