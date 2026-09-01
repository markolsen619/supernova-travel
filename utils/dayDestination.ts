export interface DayLike {
  destinationIndex?: number | null;
  activities: { type: string; title: string }[];
}

/** "Travel from Paris to Rome" -> "Rome". The multi-city prompt mandates this
 *  exact shape on the first day at each new city (generateTrip.ts). */
const TRAVEL_TO = /\bto\s+(.+)$/i;

const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);

/** True when `city` occurs in `arrival` as a whole token rather than as a
 *  fragment of a longer word — so "Rome" does not match "Rometown". */
function containsCityToken(arrival: string, city: string): boolean {
  if (!city) return false;
  let from = 0;
  for (;;) {
    const i = arrival.indexOf(city, from);
    if (i < 0) return false;
    const before = i === 0 ? '' : arrival[i - 1];
    const after = arrival[i + city.length] ?? '';
    if ((!before || !isWordChar(before)) && (!after || !isWordChar(after))) return true;
    from = i + 1;
  }
}

/** Index of the destination named by `arrival`, or -1. Longest match wins, so
 *  "New York" beats "York" when both are destinations of the same trip. */
function matchCityIndex(arrival: string, lowerCities: string[]): number {
  let best = -1;
  for (let i = 0; i < lowerCities.length; i++) {
    if (!containsCityToken(arrival, lowerCities[i])) continue;
    if (best === -1 || lowerCities[i].length > lowerCities[best].length) best = i;
  }
  return best;
}

/**
 * Maps each day to the index of the destination it takes place in.
 *
 * Three tiers, in order:
 *  1. Gemini's explicit `destinationIndex`, when every day carries a valid one.
 *  2. Inference from the mandated "Travel from X to Y" transport markers —
 *     this path serves every trip generated before destinationIndex existed,
 *     and Gemini's output is not schema-enforced, so it is not optional.
 *  3. Index 0. Deliberately the main destination rather than a union of all
 *     boxes: constraining a Rome day to the Paris box makes Mapbox return
 *     nothing, which hands the stop to Google's soft bias and still resolves
 *     correctly. A union box would instead return a confident wrong answer.
 */
export function resolveDayDestinationIndices(days: DayLike[], destinationNames: string[]): number[] {
  if (days.length === 0) return [];
  const max = Math.max(0, destinationNames.length - 1);
  const inRange = (n: number) => n >= 0 && n <= max;

  const explicit = days.map((d) => d.destinationIndex);
  if (explicit.every((n): n is number => typeof n === 'number' && Number.isInteger(n) && inRange(n))) {
    return explicit as number[];
  }

  const lower = destinationNames.map((n) => n.toLowerCase());
  const result: number[] = [];
  let current = 0;

  for (const d of days) {
    for (const act of d.activities) {
      if (act.type !== 'transport') continue;
      const arrival = TRAVEL_TO.exec(act.title ?? '')?.[1]?.trim().toLowerCase();
      if (!arrival) continue;
      const found = matchCityIndex(arrival, lower);
      if (found >= 0) {
        current = found;
        break;
      }
    }
    result.push(inRange(current) ? current : 0);
  }
  return result;
}
