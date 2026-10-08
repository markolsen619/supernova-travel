/**
 * Which trip a wallet booking belongs to. Pure — no firebase-admin — so it is
 * unit-tested; used by matchBooking (bookingMatchFunctions.ts) and the trip
 * rematch trigger. Design: docs/superpowers/specs/2026-10-03-wallet-trip-matching-design.md
 */

export interface BookingPlace { city?: string | null; countryCode?: string | null }
export interface MatchableBooking {
  kind: 'boarding_pass' | 'reservation';
  localDate?: string | null; departureTime?: string | null;
  checkIn?: string | null; checkOut?: string | null;
  placeCity?: string | null; placeCountryCode?: string | null;
  originCity?: string | null; originCountryCode?: string | null;
  tripId?: string | null; tripLink?: 'auto' | 'manual' | null; tripLinkDismissed?: boolean;
  tripSuggestions?: string[];
}
export interface MatchableTrip { id: string; title: string; start: string | null; end: string | null; places: BookingPlace[] }
export type MatchDecision = { kind: 'link'; tripId: string } | { kind: 'ask'; tripIds: string[] } | { kind: 'none' };

const MAX_ASK = 3;
const DAY_MS = 86_400_000;

/** Local spellings travellers meet on confirmations → the name trips use. */
const CITY_ALIASES: Record<string, string> = {
  roma: 'rome', munchen: 'munich', lisboa: 'lisbon', firenze: 'florence', venezia: 'venice', milano: 'milan',
  napoli: 'naples', praha: 'prague', wien: 'vienna', koln: 'cologne', bruxelles: 'brussels', brussel: 'brussels',
  kobenhavn: 'copenhagen', warszawa: 'warsaw', athina: 'athens', sevilla: 'seville', moskva: 'moscow',
  'new york city': 'new york', nyc: 'new york', 'ciudad de mexico': 'mexico city', cdmx: 'mexico city',
};

export function foldName(s: string): string {
  const first = s.split(',')[0];
  const folded = first.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return CITY_ALIASES[folded] ?? folded;
}

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

export function bookingWindow(b: MatchableBooking) {
  const places: BookingPlace[] = [{ city: b.placeCity, countryCode: b.placeCountryCode }];
  if (b.kind === 'boarding_pass') {
    const day = calendarDay(b.localDate) ?? calendarDay(b.departureTime);
    if (!day) return null;
    places.push({ city: b.originCity, countryCode: b.originCountryCode });
    const n = dayNumber(day);
    return { start: n - 1, end: n + 1, places };
  }
  const inDay = calendarDay(b.checkIn);
  if (!inDay) return null;
  // A train or ferry, like a flight home, belongs to the trip it leaves from too.
  if (b.originCity || b.originCountryCode) places.push({ city: b.originCity, countryCode: b.originCountryCode });
  const outDay = calendarDay(b.checkOut) ?? inDay;
  return { start: dayNumber(inDay), end: Math.max(dayNumber(inDay), dayNumber(outDay)), places };
}

export function tripWindow(t: MatchableTrip) {
  if (!t.start || !t.end) return null;
  return { start: dayNumber(t.start) - 1, end: dayNumber(t.end) + 1 };
}

export function placeMatches(bookingPlaces: BookingPlace[], tripPlaces: BookingPlace[]): boolean | null {
  const known = bookingPlaces.filter((p) => p.city || p.countryCode);
  if (known.length === 0) return null;
  return known.some((bp) => tripPlaces.some((tp) =>
    (!!bp.countryCode && !!tp.countryCode && bp.countryCode.toUpperCase() === tp.countryCode.toUpperCase())
    || (!!bp.city && !!tp.city && foldName(bp.city) === foldName(tp.city))));
}

export function matchDecision(b: MatchableBooking, trips: MatchableTrip[]): MatchDecision {
  const bw = bookingWindow(b);
  if (!bw) return { kind: 'none' };
  const overlapping = trips
    .map((t) => ({ t, w: tripWindow(t) }))
    .filter((x): x is { t: MatchableTrip; w: { start: number; end: number } } =>
      !!x.w && x.w.start <= bw.end && bw.start <= x.w.end)
    // closest start first: the likeliest trip leads the "Is this for a trip?" card
    .sort((a, c) => Math.abs(a.w.start - bw.start) - Math.abs(c.w.start - bw.start) || a.t.id.localeCompare(c.t.id));
  const sure = overlapping.filter((x) => placeMatches(bw.places, x.t.places) === true);
  if (sure.length === 1) return { kind: 'link', tripId: sure[0].t.id };
  if (sure.length > 1) return { kind: 'ask', tripIds: sure.slice(0, MAX_ASK).map((x) => x.t.id) };
  const unknown = overlapping.filter((x) => placeMatches(bw.places, x.t.places) === null);
  if (unknown.length > 0) return { kind: 'ask', tripIds: unknown.slice(0, MAX_ASK).map((x) => x.t.id) };
  return { kind: 'none' };
}

/** Whether a change to `tripId` may re-decide this booking. Manual and dismissed never. */
export function rematchable(b: MatchableBooking, tripId: string): boolean {
  if (b.tripLinkDismissed || b.tripLink === 'manual') return false;
  return !b.tripId || b.tripId === tripId;
}

/** The fields to write for a decision, or null when nothing changes. */
export function linkPatchFor(b: MatchableBooking, d: MatchDecision, changedTripId?: string): Record<string, unknown> | null {
  if (d.kind === 'link') {
    return b.tripId === d.tripId && b.tripLink === 'auto' ? null : { tripId: d.tripId, tripLink: 'auto', tripSuggestions: [] };
  }
  const unlink = !!changedTripId && b.tripId === changedTripId && b.tripLink === 'auto';
  const current = b.tripSuggestions ?? [];
  if (d.kind === 'ask') {
    if (unlink) return { tripId: null, tripLink: null, tripSuggestions: d.tripIds };
    const same = current.length === d.tripIds.length && current.every((id, i) => id === d.tripIds[i]);
    return same ? null : { tripSuggestions: d.tripIds };
  }
  if (unlink) return { tripId: null, tripLink: null, tripSuggestions: [] };
  // A trip that no longer fits stops being offered by "Is this for a trip?".
  return changedTripId && current.includes(changedTripId) ? { tripSuggestions: [] } : null;
}

/** Only these trip edits can change a match — likes, covers and titles can't. */
export function tripMatchInputsChanged(before: Record<string, any> | undefined, after: Record<string, any> | undefined): boolean {
  if (!before || !after) return true;
  const ms = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);
  const places = (t: Record<string, any>) => JSON.stringify([
    [t.destination?.name ?? null, t.destination?.countryCode ?? null],
    ...((t.additionalDestinations ?? []) as any[]).map((d) => [d?.name ?? null, d?.countryCode ?? null]),
  ]);
  return ms(before.startDate) !== ms(after.startDate)
    || ms(before.endDate) !== ms(after.endDate)
    || places(before) !== places(after)
    || JSON.stringify(before.collaborators ?? []) !== JSON.stringify(after.collaborators ?? []);
}
export function toMatchableTrip(id: string, data: Record<string, any>): MatchableTrip {
  const day = (v: any) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString().slice(0, 10) : null);
  const dest = (d: any): BookingPlace => ({ city: d?.name ?? null, countryCode: d?.countryCode ?? null });
  return {
    id,
    title: String(data.title ?? ''),
    start: day(data.startDate),
    end: day(data.endDate),
    places: [dest(data.destination), ...((data.additionalDestinations ?? []) as any[]).map(dest)],
  };
}
