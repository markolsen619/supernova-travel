/**
 * A balance typed by hand is the newest one: it gets today's `balanceAsOf`
 * and loses "from email", so an older forwarded statement can't replace it
 * (functions/src/loyaltyImport.ts loyaltyWrite). Null when the balance didn't change.
 */
export function handEditedBalance(previous: number | undefined, next: number, today: string): { balanceAsOf: string; fromEmail: false } | null {
  return previous === next ? null : { balanceAsOf: today, fromEmail: false };
}
