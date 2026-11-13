import { COUNTRY_INFO } from '@/constants/countryInfo';
import { tripSpan, type SpanTrip } from '@/utils/homeState';

/** Before you go (spec 2026-11-12). Pure. */
export type CountryTrip = { destination: { countryCode?: string | null }; additionalDestinations?: { countryCode?: string | null }[] };
export type CountryRow = { kind: 'plugs' | 'money' | 'tipping' | 'emergency' | 'driving' | 'water'; label: string; value: string; tel?: string };

export function tripCountries(trip: CountryTrip): string[] {
  const out: string[] = [];
  for (const c of [trip.destination, ...(trip.additionalDestinations ?? [])]) {
    const code = (c?.countryCode ?? '').trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export const internationalCountries = (countries: string[], home: string | null) => countries.filter((c) => c !== home);

const lowVoltage = (v: number) => v <= 127;

export function plugAdvice(home: string | null, dest: string): string | null {
  const d = COUNTRY_INFO[dest];
  if (!d) return null;
  const base = `Type ${d.plugs.join(' / ')} · ${d.voltage} V`;
  const h = home ? COUNTRY_INFO[home] : undefined;
  if (!h) return base;
  const shared = d.plugs.filter((p) => h.plugs.includes(p));
  const same = shared.length === d.plugs.length && shared.length === h.plugs.length;
  const fit = same ? 'Same plugs as home.' : shared.length > 0 ? 'Your plugs fit some sockets.' : `Bring an adapter — ${home} plugs don't fit.`;
  const volts = lowVoltage(h.voltage) !== lowVoltage(d.voltage) ? ` ${d.voltage} V: check your chargers say 100–240 V.` : '';
  return `${base}. ${fit}${volts}`;
}

export function countryRows(code: string, home: string | null): { code: string; name: string; rows: CountryRow[] } {
  const c = COUNTRY_INFO[code];
  if (!c) return { code, name: code, rows: [] };
  const rows: CountryRow[] = [];
  const plugs = plugAdvice(home, code);
  if (plugs) rows.push({ kind: 'plugs', label: 'Plugs', value: plugs });
  rows.push({ kind: 'money', label: 'Money', value: `${c.currency.name} (${c.currency.code})` });
  if (c.tipping) rows.push({ kind: 'tipping', label: 'Tipping', value: c.tipping });
  rows.push({ kind: 'emergency', label: 'Emergency', value: c.emergency, tel: c.emergency.match(/[\d+]+/)?.[0] });
  rows.push({ kind: 'driving', label: 'Driving', value: c.drive === 'left' ? 'On the left' : 'On the right' });
  if (c.tapWater) rows.push({ kind: 'water', label: 'Tap water', value: c.tapWater === 'safe' ? 'Safe to drink' : 'Drink bottled' });
  return { code, name: c.name, rows };
}

/** Upcoming or current (undated = upcoming), members only, at least one known international country. */
export function showBeforeYouGo(trip: CountryTrip & SpanTrip, today: string, isMember: boolean, home: string | null): boolean {
  if (!isMember) return false;
  const { end } = tripSpan(trip);
  if (end && end < today) return false;
  return internationalCountries(tripCountries(trip), home).some((c) => COUNTRY_INFO[c]);
}
