interface Stamped {
  id: string;
  createdAt: { toMillis: () => number } | null;
}

/**
 * Joins trip lists read by separate queries into one, newest first, each trip
 * once. A profile's Trips tab has to read public and followers-only trips
 * separately — see useProfileTrips — and show them as one list.
 */
export function mergeNewestFirst<T extends Stamped>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const trip of list) if (!byId.has(trip.id)) byId.set(trip.id, trip);
  const millis = (trip: T) => trip.createdAt?.toMillis() ?? -Infinity;
  return [...byId.values()].sort((a, b) => millis(b) - millis(a));
}
