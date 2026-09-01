export interface QueueActivity {
  id: string;
  lat: number | null;
  lng: number | null;
  searchQuery?: string | null;
  groundingFailedAt?: unknown;
}

export interface QueueDay {
  id: string;
  activities: QueueActivity[];
}

export interface StopToGround {
  searchQuery: string;
  destinationIndex: number;
  /** Every activity sharing this (destinationIndex, normalised query). Always
   *  at least one. One lookup grounds them all — deduping without fanning the
   *  result out would leave the repeats ungrounded and re-billed on tap. */
  targets: { activityId: string; dayId: string }[];
}

const normalise = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Picks which stops the background pass should ground.
 *
 * Every exclusion here is a billed call avoided. Deduplication is keyed by
 * query *and* destination: itineraries repeat anchors within a city (a hotel,
 * a central plaza), but "Central Station" in Paris and in Rome are different
 * places and must not collapse into one. A repeat within the same
 * destination is not dropped — its activity/day pair is folded into the
 * existing entry's `targets` so the single lookup this produces still grounds
 * every row that shares it, instead of leaving the repeats permanently
 * ungrounded.
 */
export function selectStopsToGround(days: QueueDay[], destinationIndices: number[]): StopToGround[] {
  const byKey = new Map<string, StopToGround>();
  const out: StopToGround[] = [];

  days.forEach((day, i) => {
    const destinationIndex = destinationIndices[i] ?? 0;
    for (const a of day.activities) {
      if (a.lat != null && a.lng != null) continue;
      if (a.groundingFailedAt) continue;
      const q = (a.searchQuery ?? '').trim();
      if (!q) continue;
      const key = `${destinationIndex}::${normalise(q)}`;
      const target = { activityId: a.id, dayId: day.id };
      const existing = byKey.get(key);
      if (existing) {
        existing.targets.push(target);
        continue;
      }
      const entry: StopToGround = { searchQuery: q, destinationIndex, targets: [target] };
      byKey.set(key, entry);
      out.push(entry);
    }
  });

  return out;
}
