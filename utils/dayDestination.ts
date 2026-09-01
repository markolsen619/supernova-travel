export interface DayLike {
  destinationIndex?: number | null;
  activities: { type: string; title: string }[];
}

/** "Travel from Paris to Rome" -> "Rome". The multi-city prompt mandates this
 *  exact shape on the first day at each new city (generateTrip.ts). */
const TRAVEL_TO = /\bto\s+(.+)$/i;

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
  if (explicit.every((n): n is number => typeof n === 'number' && inRange(n))) {
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
      const found = lower.findIndex((city) => arrival.includes(city));
      if (found >= 0) {
        current = found;
        break;
      }
    }
    result.push(inRange(current) ? current : 0);
  }
  return result;
}
