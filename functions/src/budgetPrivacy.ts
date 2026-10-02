/**
 * A trip's budget is private to the people taking it, so it lives in
 * trips/{id}/private/budget (members-only rules), not on the trip document,
 * which every viewer can read. Apps from 1.0.1 and earlier still write
 * budgetAmount/budgetCurrency onto the trip; budgetPrivacyFunctions.ts moves
 * them across. Pure, so it's tested here.
 */
export function budgetMigration(trip: Record<string, unknown> | undefined): {
  strip: boolean;
  budget: { amount: number; currency: string } | null;
} {
  if (!trip || !('budgetAmount' in trip || 'budgetCurrency' in trip)) return { strip: false, budget: null };
  const amount = trip.budgetAmount;
  // A null amount isn't "clear my budget": older apps write null on every
  // trip edit when their budget field is empty, which it now always is.
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { strip: true, budget: null };
  const currency = typeof trip.budgetCurrency === 'string' && trip.budgetCurrency ? trip.budgetCurrency : 'USD';
  return { strip: true, budget: { amount, currency } };
}
