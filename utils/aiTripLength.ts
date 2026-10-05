/**
 * The longest trip AI generation plans. The server enforces the same number
 * (functions/src/quotaUtils.ts `aiTripLengthAllowed`); a test keeps them equal.
 * Was 14 — raised to 21 (2026-10-05) so a three-week trip fits, with
 * generateTrip's time limit raised to match.
 */
export const MAX_AI_TRIP_DAYS = 21;
