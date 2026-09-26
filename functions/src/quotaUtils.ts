// Single source of truth for free-tier quota windows — shared by each
// feature's enforcing Cloud Function and its client-facing "remaining" read,
// so the UI's displayed count can never drift from what the server actually
// allows.

/**
 * AI trip generation is now capped for EVERY tier, not just free.
 *
 * Gemini is billed per call, so an uncapped paid tier is an uncapped bill —
 * the one subscriber who generates fifty itineraries a month costs more than
 * they pay. Paid buys a shorter window (weekly rather than monthly), not an
 * unmetered one.
 */
export const FREE_TIER_MONTHLY_AI_TRIP_LIMIT = 1;
export const PAID_TIER_WEEKLY_AI_TRIP_LIMIT = 1;

/** @deprecated Free tier moved to a monthly window. Kept so an older client
 *  importing it still compiles; read aiTripQuotaPolicy() instead. */
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

// ── Monthly windows ─────────────────────────────────────────────────────────
// `now` is a parameter rather than read inside, so month-boundary behaviour
// is testable without faking the clock.

/** First of the current month, 00:00 UTC. A calendar month, not 30 days. */
export function getMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First of next month, 00:00 UTC — when a monthly quota resets. Built from
 *  month + 1 rather than by adding days, so February and December are right
 *  without special cases. */
export function getNextMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar month
 *  (e.g. `getMonthlyQuotaKey('ai_trips')` → `"ai_trips_2026-09-01"`). */
export function getMonthlyQuotaKey(prefix: string, now: Date = new Date()): string {
  return `${prefix}_${getMonthStart(now).toISOString().split('T')[0]}`;
}

// ── AI trip policy ──────────────────────────────────────────────────────────

export type QuotaWindow = 'week' | 'month';

export interface AiTripQuotaPolicy {
  /** Generations allowed inside the window. */
  limit: number;
  window: QuotaWindow;
  /** Field on usage_quotas/{uid} holding this window's count. */
  quotaKey: string;
  /** When the window rolls over. */
  resetsAt: Date;
}

const PAID_TIERS = new Set(['pro', 'business']);

/**
 * What a given tier is allowed, in one place.
 *
 * Both generateTrip (which enforces) and getAiTripQuota (which reports what
 * is left) read this, so the number the UI shows cannot drift from the number
 * the server actually allows — the same reason the weekly key helpers were
 * centralised here originally.
 *
 * Free and paid deliberately use DIFFERENT quota keys rather than sharing a
 * counter with different limits. Upgrading mid-month should not arrive with
 * the free tier's spent generation already counted against the new window.
 *
 * Unrecognised or missing tiers resolve to free: createUserProfile omits
 * `tier` for new accounts, and a typo must never hand out the better window.
 */
export function aiTripQuotaPolicy(
  tier: string | null | undefined,
  now: Date = new Date(),
): AiTripQuotaPolicy {
  const paid = typeof tier === 'string' && PAID_TIERS.has(tier);

  return paid
    ? {
        limit: PAID_TIER_WEEKLY_AI_TRIP_LIMIT,
        window: 'week',
        quotaKey: `ai_trips_${getWeekStart().toISOString().split('T')[0]}`,
        resetsAt: getNextWeekStart(),
      }
    : {
        limit: FREE_TIER_MONTHLY_AI_TRIP_LIMIT,
        window: 'month',
        quotaKey: getMonthlyQuotaKey('ai_trips', now),
        resetsAt: getNextMonthStart(now),
      };
}
