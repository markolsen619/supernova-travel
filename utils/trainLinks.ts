import { applyTemplate, type LinkTemplates } from '@/utils/partnerLinks';
import { haversineMeters } from '@/utils/tripRoutes';

/**
 * Trains & buses between a trip's cities (spec 2026-11-12): only for short legs with nothing booked. Trip.com in
 * Europe, 12Go in Asia, chosen by the arriving city's country like tours' GetYourGuide/Viator; no link elsewhere.
 * (Omio was the first choice: not on Travelpayouts for this account, impact.com declined us, Trainline isn't listed —
 * owner, 2026-11-12. Trip.com is under review there; links work untagged until then.)
 * The links open the partner's search page; only our affiliate tag goes with them. Pure.
 */
export const TRAIN_MAX_KM = 800;
export type TrainPartner = 'tripcom' | 'twelveGo';
export type LegCity = { name: string; countryCode: string | null; lat: number | null; lng: number | null };

const EUROPE = new Set([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT',
  'LI', 'LT', 'LU', 'LV', 'MC', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'VA', 'XK',
]);
const TWELVE_GO = new Set(['BD', 'CN', 'HK', 'ID', 'IN', 'JP', 'KH', 'KR', 'LA', 'LK', 'MM', 'MO', 'MY', 'NP', 'PH', 'SG', 'TH', 'TW', 'VN']);
const PARTNER_URL: Record<TrainPartner, string> = { tripcom: 'https://www.trip.com/trains/europe/', twelveGo: 'https://12go.asia/en' };
const PARTNER_NAME: Record<TrainPartner, string> = { tripcom: 'Trip.com', twelveGo: '12Go' };

export function trainPartner(countryCode: string | null | undefined): TrainPartner | null {
  const c = (countryCode ?? '').toUpperCase();
  return EUROPE.has(c) ? 'tripcom' : TWELVE_GO.has(c) ? 'twelveGo' : null;
}

export const trainUrl = (partner: TrainPartner, templates: LinkTemplates) => applyTemplate(PARTNER_URL[partner], templates[partner]);

export function trainLink(prev: LegCity, city: LegCity, gettingHereCount: number, templates: LinkTemplates): { label: string; url: string } | null {
  if (gettingHereCount > 0) return null;
  const partner = trainPartner(city.countryCode);
  if (!partner) return null;
  if (prev.lat == null || prev.lng == null || city.lat == null || city.lng == null) return null;
  const km = haversineMeters({ lat: prev.lat, lng: prev.lng }, { lat: city.lat, lng: city.lng }) / 1000;
  if (km > TRAIN_MAX_KM) return null;
  const short = (n: string) => n.split(',')[0].trim();
  return { label: `Find trains & buses ${short(prev.name)} → ${short(city.name)} · ${PARTNER_NAME[partner]}`, url: trainUrl(partner, templates) };
}
