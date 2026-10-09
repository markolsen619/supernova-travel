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

const NOT_A_PLACE = new Set(['free', 'transport', 'flight']);

/**
 * A stop typed by hand gets a search query too, so the background pass puts it
 * on the map (within its day's city) like an AI stop — people place their own
 * stops to check they're near each other. Free time, transport and flights
 * aren't places to pin.
 */
export function manualSearchQuery(type: string, title: string, city: string | null | undefined): string | null {
  const t = title.trim();
  if (NOT_A_PLACE.has(type) || t.length < 3) return null;
  const c = (city ?? '').trim();
  if (!c || t.toLowerCase().includes(c.toLowerCase())) return t;
  return `${t}, ${c}`;
}

// Words that describe the plan, not the place: "Dinner with Kelly" names no restaurant.
const PLAN_WORDS = new Set([
  'the', 'a', 'an', 'and', 'with', 'at', 'in', 'on', 'to', 'of', 'for', 'our', 'my', 'de', 'la', 'le', 'el',
  'breakfast', 'brunch', 'lunch', 'dinner', 'drinks', 'drink', 'coffee', 'meal', 'eat', 'food',
  'visit', 'see', 'tour', 'explore', 'walk', 'stay', 'hotel', 'check', 'checkin', 'night', 'day', 'trip',
  'friends', 'family', 'kids', 'everyone',
]);
const distinctive = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !PLAN_WORDS.has(w));

/**
 * Whether a lookup result is the place a person typed: it must share a word
 * that names something (not "dinner", "with", "hotel"). Otherwise a stop typed
 * as "Dinner with Kelly" was pinned to whichever restaurant the search found
 * first. A typed stop is never renamed either (titleSource 'user').
 */
export function typedStopMatches(title: string, placeName: string): boolean {
  const want = distinctive(title);
  if (want.length === 0) return false;
  const have = new Set(distinctive(placeName));
  return want.some((w) => have.has(w) || [...have].some((h) => h.startsWith(w) || w.startsWith(h)));
}
