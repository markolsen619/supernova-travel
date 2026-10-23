/**
 * Deciding WHICH flights to ask AviationStack about, and how often.
 *
 * checkFlightStatus used to call the API once per boarding pass, every 30
 * minutes, for every pass departing in the next 24 hours. Two costs fell out
 * of that: ten passengers on one flight meant ten identical calls, and a
 * single flight was polled ~48 times over its final day whether or not
 * anything could plausibly have changed yet.
 *
 * Both are fixed here rather than in the scheduled function, so the decisions
 * are pure and testable — this file imports no firebase-admin deliberately,
 * the same way pushData.ts does.
 */

/** A pass as this module needs to see it. Anything wider is ignored. */
export interface PollablePass {
  flightNumber: string;
  /** ISO 8601 instant — a departure really does happen at one moment. */
  departureTime: string;
}

/** The tiers that pay. Anything else, including nothing, does not. */
const PAID_TIERS = new Set(['pro', 'business']);

/**
 * Whether a tier string entitles the user to live flight status.
 *
 * Fails closed on purpose. `createUserProfile` deliberately omits `tier` for
 * new accounts — every reader defaults a missing field to free — so an absent
 * value is the ordinary shape of a free user, not a broken document. A tier
 * this build has never heard of is treated the same way: a typo or a future
 * value must not hand out a paid feature by accident.
 */
export function isPaidTier(tier: string | null | undefined): boolean {
  return typeof tier === 'string' && PAID_TIERS.has(tier);
}

/**
 * Passes worth spending an AviationStack call on.
 *
 * Live flight status is a paid feature, so a free user's flight is never
 * polled — previously it was polled at full cost and simply had its push
 * suppressed afterwards, which is the expensive way round. An owner missing
 * from `tierByUid` (deleted account, unreadable document) is dropped too:
 * an unknown owner must not cost money.
 */
export function filterPassesForPaidOwners<T extends { ownerUid: string }>(
  passes: T[],
  tierByUid: Map<string, string | null | undefined>,
): T[] {
  return passes.filter((pass) => isPaidTier(tierByUid.get(pass.ownerUid)));
}

export interface FlightGroup<T extends PollablePass> {
  /** Normalised, as sent to the API. */
  flightNumber: string;
  /** `YYYY-MM-DD`, the API's flight_date parameter. */
  departureDate: string;
  /** Every pass this one API call answers for. */
  passes: T[];
}

/**
 * Identity of one real-world flight leg.
 *
 * Normalised because flight numbers are hand-typed into the add-pass form:
 * "tp 204", "TP204" and "Tp-204" are the same aircraft, and treating them as
 * three flights would defeat the deduplication entirely.
 */
export function flightKey(flightNumber: string, departureTime: string): string {
  const normalised = flightNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${normalised}|${departureTime.slice(0, 10)}`;
}

/**
 * One group per real flight, so the caller makes one API call per flight
 * rather than one per passenger. Order is stable: first appearance wins.
 */
export function groupPassesByFlight<T extends PollablePass>(passes: T[]): FlightGroup<T>[] {
  const groups = new Map<string, FlightGroup<T>>();

  for (const pass of passes) {
    const key = flightKey(pass.flightNumber, pass.departureTime);
    const existing = groups.get(key);
    if (existing) {
      existing.passes.push(pass);
      continue;
    }
    groups.set(key, {
      flightNumber: pass.flightNumber.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      departureDate: pass.departureTime.slice(0, 10),
      passes: [pass],
    });
  }

  return [...groups.values()];
}

/**
 * Which of a flight's three checks (if any) this run should make. AviationStack's free plan is
 * 100 calls a month, so each flight gets three: two hours out (first gate, early delay), 45 minutes
 * out (late gate change, new delay) and 30 minutes after scheduled arrival (landed / cancelled).
 * A checkpoint is due in the one half-hourly run that follows it — derived from the clock, so it
 * costs no Firestore write; a missed run just skips that check.
 */
export type Checkpoint = 'before120' | 'before45' | 'afterArrival';
export const LOOKBACK_HOURS = 20;
export const LOOKAHEAD_HOURS = 3;
const MIN = 60_000;

export function dueCheckpoint(departureMs: number, arrivalMs: number | null, nowMs: number, runMinutes = 30): Checkpoint | null {
  const marks: [Checkpoint, number][] = [['before120', departureMs - 120 * MIN], ['before45', departureMs - 45 * MIN]];
  if (arrivalMs !== null && Number.isFinite(arrivalMs)) marks.push(['afterArrival', arrivalMs + 30 * MIN]);
  for (const [name, at] of marks) if (at <= nowMs && at > nowMs - runMinutes * MIN) return name;
  return null;
}
