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
  activityId: string;
  dayId: string;
  searchQuery: string;
  destinationIndex: number;
}

const normalise = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Picks which stops the background pass should ground.
 *
 * Every exclusion here is a billed call avoided. Deduplication is keyed by
 * query *and* destination: itineraries repeat anchors within a city (a hotel,
 * a central plaza), but "Central Station" in Paris and in Rome are different
 * places and must not collapse into one.
 */
export function selectStopsToGround(days: QueueDay[], destinationIndices: number[]): StopToGround[] {
  const seen = new Set<string>();
  const out: StopToGround[] = [];

  days.forEach((day, i) => {
    const destinationIndex = destinationIndices[i] ?? 0;
    for (const a of day.activities) {
      if (a.lat != null && a.lng != null) continue;
      if (a.groundingFailedAt) continue;
      const q = (a.searchQuery ?? '').trim();
      if (!q) continue;
      const key = `${destinationIndex}::${normalise(q)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ activityId: a.id, dayId: day.id, searchQuery: q, destinationIndex });
    }
  });

  return out;
}
