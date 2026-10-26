/** The profile's "Been there" line: trips and distinct countries (spec 2026-10-25-past-trips-from-photos). */
type T = { destination?: { countryCode?: string | null } | null; additionalDestinations?: { countryCode?: string | null }[] | null };

export function beenThereSummary(trips: T[]): string {
  if (!trips.length) return '';
  const countries = new Set<string>();
  for (const t of trips) for (const c of [t.destination, ...(t.additionalDestinations ?? [])]) if (c?.countryCode) countries.add(c.countryCode.toUpperCase());
  const tripsText = `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`;
  return countries.size ? `${tripsText} · ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}` : tripsText;
}
