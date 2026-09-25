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
 * Whether this run should poll a flight departing in `hoursUntilDeparture`.
 *
 * The schedule fires every 30 minutes, so this thins that down by distance
 * from departure: nothing meaningful changes 20 hours out, and everything
 * does in the last hour.
 *
 *   under 3h   every run      (~30 min)
 *   3h to 12h  top of hour    (~1 h)
 *   over 12h   every 4th hour (~4 h)
 *
 * Derived from the clock rather than a stored lastCheckedAt, so back-off
 * costs no extra Firestore write per flight per run — which would have eaten
 * a good part of what the API saving bought.
 */
export function shouldPollFlight(hoursUntilDeparture: number, now: Date): boolean {
  // Already left. The Firestore query bounds this too, but a pass can depart
  // between the query and this check on a slow run.
  if (hoursUntilDeparture < 0) return false;

  if (hoursUntilDeparture <= 3) return true;

  const onTheHour = now.getUTCMinutes() < 30;
  if (hoursUntilDeparture <= 12) return onTheHour;

  return onTheHour && now.getUTCHours() % 4 === 0;
}
