// Single source of truth for the free-tier weekly AI trip quota — shared by
// generateTrip.ts (enforcement) and getAiTripQuota.ts (client-facing read),
// so the "remaining" the client shows can never drift from what the server
// actually allows.

export const FREE_TIER_WEEKLY_AI_TRIP_LIMIT = 1;

/** Start of the current calendar week (Monday 00:00 UTC) — NOT a rolling 7-day window. */
export function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

/** Start of next calendar week (Monday 00:00 UTC) — when the quota resets. */
export function getNextWeekStart(): Date {
  const weekStart = getWeekStart();
  return new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 7,
  ));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar week. */
export function getWeeklyQuotaKey(): string {
  return `ai_trips_${getWeekStart().toISOString().split('T')[0]}`;
}
