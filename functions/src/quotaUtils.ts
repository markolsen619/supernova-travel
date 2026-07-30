// Single source of truth for free-tier quota windows — shared by each
// feature's enforcing Cloud Function and its client-facing "remaining" read,
// so the UI's displayed count can never drift from what the server actually
// allows.

export const FREE_TIER_WEEKLY_AI_TRIP_LIMIT = 1;
export const FREE_TIER_YEARLY_IMPORT_LIMIT = 1;

/** Start of the current calendar week (Monday 00:00 UTC) — NOT a rolling 7-day window. */
export function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

/** Start of next calendar week (Monday 00:00 UTC) — when the weekly quota resets. */
export function getNextWeekStart(): Date {
  const weekStart = getWeekStart();
  return new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 7,
  ));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar week, namespaced by feature
 * (e.g. `getWeeklyQuotaKey('ai_trips')` → `"ai_trips_2026-07-27"`). */
export function getWeeklyQuotaKey(prefix: string): string {
  return `${prefix}_${getWeekStart().toISOString().split('T')[0]}`;
}

/** Start of the current calendar year (Jan 1 00:00 UTC) — NOT a rolling 365-day window, same
 * calendar-period-not-rolling-window philosophy as getWeekStart(). */
export function getYearStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

/** Start of next calendar year (Jan 1 00:00 UTC) — when the yearly quota resets. */
export function getNextYearStart(): Date {
  const yearStart = getYearStart();
  return new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 0, 1));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar year, namespaced by feature
 * (e.g. `getYearlyQuotaKey('wallet_imports')` → `"wallet_imports_2026-01-01"`). */
export function getYearlyQuotaKey(prefix: string): string {
  return `${prefix}_${getYearStart().toISOString().split('T')[0]}`;
}
