/**
 * When generation "fails", the server may well have made the trip: a phone
 * can lose the connection while the server finishes, and the Functions SDK
 * reports that as `internal` with no reason. Each generation carries a
 * requestId that is also its trip id (functions/src/generationRequest.ts),
 * so the app can look the trip up instead of showing a failure.
 */

const CONNECTION_LOSS = new Set(['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded']);

/** An error that may mean "no answer", not "no trip". Server refusals are final. */
export function isConnectionLoss(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && CONNECTION_LOSS.has(code);
}

/**
 * Checks for the trip until it appears or `attempts` run out. A check that
 * throws counts as "not yet": the trips rules refuse to read a missing trip
 * rather than report it missing.
 */
export async function waitForGeneratedTrip(
  exists: () => Promise<boolean>,
  opts: { attempts: number; intervalMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<boolean> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < opts.attempts; i++) {
    try {
      if (await exists()) return true;
    } catch {
      // not there yet
    }
    if (i < opts.attempts - 1) await sleep(opts.intervalMs);
  }
  return false;
}
