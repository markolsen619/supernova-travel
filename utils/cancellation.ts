/**
 * The "before you go" step on the cancel path.
 *
 * Deliberately thin. Cancelling is the user's decision and Apple requires it
 * to be reachable without obstruction, so this asks once, accepts silence,
 * and never gates the handoff to RevenueCat's Customer Center — which owns
 * the actual cancellation.
 */

export interface CancelReason {
  id: string;
  label: string;
}

/**
 * Short and non-overlapping. A long list is a wall to read when someone has
 * already decided to leave, and overlapping options make the results
 * unusable. No "Other": it collects nothing actionable, and the free-text
 * note covers what these miss.
 */
export const CANCEL_REASONS: CancelReason[] = [
  { id: 'too_expensive', label: "It costs more than I get from it" },
  { id: 'not_using', label: "I'm not travelling right now" },
  { id: 'missing_feature', label: "It's missing something I need" },
  { id: 'found_alternative', label: "I'm using something else" },
  { id: 'technical', label: "It didn't work properly" },
];

const REASON_IDS = new Set(CANCEL_REASONS.map((r) => r.id));

export function isValidCancelReason(id: string | null | undefined): boolean {
  return typeof id === 'string' && REASON_IDS.has(id);
}

/** Free-text is capped so one pasted essay can't bloat the document. */
const MAX_NOTE = 500;

export interface CancellationFeedbackInput {
  uid: string;
  tier: string;
  reason: string | null;
  note: string;
}

export interface CancellationFeedback {
  uid: string;
  tier: string;
  /** null when skipped OR unrecognised — see below. */
  reason: string | null;
  note: string;
}

/**
 * The document shape written when someone cancels.
 *
 * An unrecognised reason is stored as null rather than passed through: a typo
 * or an id from a build that shipped different options must not quietly
 * become a new category nobody can aggregate.
 */
export function buildCancellationFeedback({
  uid,
  tier,
  reason,
  note,
}: CancellationFeedbackInput): CancellationFeedback {
  return {
    uid,
    tier,
    reason: isValidCancelReason(reason) ? (reason as string) : null,
    note: note.trim().slice(0, MAX_NOTE),
  };
}
