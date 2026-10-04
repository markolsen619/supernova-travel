import type { ParseTravelConfirmationResult } from '@/types/ai';
import { parseCalendarDate } from '@/utils/calendarDate';

export interface TripSummary { tripId: string; title: string; start: string | null; end: string | null }
export type MatchResult = { kind: 'link'; trip: TripSummary } | { kind: 'ask'; trips: TripSummary[] } | { kind: 'none' };

export function linkPatch(action: 'link' | 'unlink' | 'undo' | 'not_for_trip', tripId?: string): Record<string, unknown> {
  if (action === 'link') return { tripId: tripId ?? null, tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false };
  if (action === 'not_for_trip') return { tripSuggestions: [], tripLinkDismissed: true };
  return { tripId: null, tripLink: null, tripSuggestions: [], tripLinkDismissed: true };
}

export function tripDateEyebrow(start: string | null, end: string | null): string {
  const s = start ? parseCalendarDate(start) : null;
  const e = end ? parseCalendarDate(end) : null;
  if (!s || !e) return 'DATES TBD';
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return s.getMonth() === e.getMonth()
    ? `${mon(s)} ${s.getDate()} – ${e.getDate()}`
    : `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}`;
}

const ISO2 = /^[A-Za-z]{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The place and day fields a parsed confirmation adds to the saved item (spec: Data). */
export function draftPlaceFields(draft: ParseTravelConfirmationResult): Record<string, string> {
  const out: Record<string, string> = {};
  const f = draft.fields as Record<string, string | undefined>;
  const city = draft.kind === 'boarding_pass' ? f.destinationCity : f.city;
  const country = draft.kind === 'boarding_pass' ? f.destinationCountryCode : f.countryCode;
  if (city?.trim()) out.placeCity = city.trim();
  if (country && ISO2.test(country)) out.placeCountryCode = country.toUpperCase();
  if (draft.kind === 'boarding_pass') {
    if (f.originCountryCode && ISO2.test(f.originCountryCode)) out.originCountryCode = f.originCountryCode.toUpperCase();
    if (f.departureLocalDate && DAY.test(f.departureLocalDate)) out.localDate = f.departureLocalDate;
  }
  return out;
}
