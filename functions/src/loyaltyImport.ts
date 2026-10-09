/**
 * Rewards-program statements forwarded to the email import address keep the
 * wallet's loyalty programs up to date (Pro). Gemini returns them as
 * `{ kind: 'loyalty', fields }` entries next to bookings; these rules decide
 * what is saved. Pure — no firebase-admin — so it is unit-tested.
 */
export const MAX_LOYALTY_PER_EMAIL = 3;

// Only values shipped apps know: they look up LOYALTY_ICONS[programType] and
// would crash on anything else (see the transit note in CLAUDE.md).
const TYPES = new Set(['airline', 'hotel', 'car_rental', 'credit_card', 'other']);
const UNITS = new Set(['miles', 'points', 'nights', 'segments']);
const TIERS = new Set(['standard', 'silver', 'gold', 'platinum', 'diamond']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MASK = /[•*●]|x{3,}/i;

export interface LoyaltyUpdate {
  programName: string;
  programType: string;
  memberNumber?: string;
  /** The number is shown partly hidden ("••••4821"): matched on its last digits, never saved over a full one. */
  masked: boolean;
  balance: number;
  unit: string;
  tier?: string;
  expiryDate?: string;
  statementDate?: string;
}

const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const day = (v: unknown) => { const s = str(v); return s && DAY.test(s) ? s : undefined; };
const lower = (v: unknown) => str(v)?.toLowerCase();

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function loyaltyFromParse(parsed: unknown): LoyaltyUpdate[] {
  const list = (parsed as { bookings?: unknown } | null)?.bookings;
  if (!Array.isArray(list)) return [];
  const out: LoyaltyUpdate[] = [];
  for (const entry of list) {
    if (out.length >= MAX_LOYALTY_PER_EMAIL) break;
    if ((entry as { kind?: unknown })?.kind !== 'loyalty') continue;
    const f = ((entry as { fields?: unknown }).fields ?? {}) as Record<string, unknown>;
    const programName = str(f.programName);
    const balance = amount(f.balance);
    if (!programName || balance === null) continue;
    const type = lower(f.programType);
    const unit = lower(f.unit);
    const tier = lower(f.tier);
    const memberNumber = str(f.memberNumber, 40);
    out.push({
      programName,
      programType: type && TYPES.has(type) ? type : 'other',
      memberNumber,
      masked: !!memberNumber && MASK.test(memberNumber),
      balance,
      unit: unit && UNITS.has(unit) ? unit : 'points',
      tier: tier && TIERS.has(tier) ? tier : undefined,
      expiryDate: day(f.expiryDate),
      statementDate: day(f.statementDate),
    });
  }
  return out;
}

const digits = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fold = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const tailOf = (n: string) => digits(n.split(MASK).pop());

function numberMatches(update: LoyaltyUpdate, existing: string | undefined): boolean {
  if (!existing || !digits(existing) || !update.memberNumber) return false;
  if (update.masked) {
    const tail = tailOf(update.memberNumber);
    return tail.length >= 3 && (MASK.test(existing) ? tailOf(existing) === tail : digits(existing).endsWith(tail));
  }
  // A program first saved from a masked statement, now seen in full.
  if (MASK.test(existing)) {
    const tail = tailOf(existing);
    return tail.length >= 3 && digits(update.memberNumber).endsWith(tail);
  }
  return digits(existing) === digits(update.memberNumber);
}

/**
 * Which existing program this statement is for: by member number, else the
 * one program with that name (and no conflicting number). Null = add it.
 */
export function matchLoyalty(update: LoyaltyUpdate, programs: { id: string; programName?: string; memberNumber?: string }[]): string | null {
  const byNumber = programs.filter((p) => numberMatches(update, p.memberNumber));
  if (byNumber.length === 1) return byNumber[0].id;
  if (byNumber.length > 1) return null;
  const name = fold(update.programName);
  const byName = programs.filter((p) => {
    const other = fold(p.programName);
    if (!other || !name || !(other === name || other.includes(name) || name.includes(other))) return false;
    // Same name but a different number is a different account.
    return !(update.memberNumber && digits(p.memberNumber));
  });
  return byName.length === 1 ? byName[0].id : null;
}

/**
 * The write for this statement: a new program, or a patch to the matched one.
 * Null when the statement is older than the balance already saved.
 */
export function loyaltyWrite(
  update: LoyaltyUpdate,
  existing: { memberNumber?: string; balanceAsOf?: string } | null,
  ctx: { uid: string; emailImportId: string; nowIso: string },
): { create: boolean; data: Record<string, unknown> } | null {
  const asOf = update.statementDate ?? ctx.nowIso.slice(0, 10);
  if (existing?.balanceAsOf && existing.balanceAsOf > asOf) return null;
  const common: Record<string, unknown> = {
    balance: update.balance, unit: update.unit, balanceAsOf: asOf,
    source: 'email', emailImportId: ctx.emailImportId, updatedAt: ctx.nowIso,
  };
  if (update.tier) common.tier = update.tier;
  if (update.expiryDate) common.expiryDate = update.expiryDate;
  if (!existing) {
    return { create: true, data: {
      ...common, ownerUid: ctx.uid, programName: update.programName, programType: update.programType,
      ...(update.memberNumber ? { memberNumber: update.memberNumber } : {}),
      isManual: false, createdAt: ctx.nowIso,
    } };
  }
  // A full number fills a blank or a masked one, never the other way round.
  if (update.memberNumber && !update.masked && (!digits(existing.memberNumber) || MASK.test(existing.memberNumber ?? ''))) {
    common.memberNumber = update.memberNumber;
  }
  return { create: false, data: common };
}

const LOYALTY_WORDS = /statement|points balance|miles balance|account summary|rewards|loyalty|elite status|status update|your (miles|points)|award miles|member(ship)? (summary|update)/i;
export function looksLikeLoyalty(subject: string, text: string): boolean {
  return LOYALTY_WORDS.test(subject) || LOYALTY_WORDS.test(text.slice(0, 20_000));
}

/** One email with bookings and balances: the push leads with the bookings. */
export function mixedPushCopy(bookings: number, balances: number): { title: string; body: string } {
  return {
    title: `Added ${bookings} booking${bookings === 1 ? '' : 's'} to your wallet`,
    body: `${balances} balance${balances === 1 ? '' : 's'} updated too`,
  };
}

export function loyaltyPushCopy(u: LoyaltyUpdate): { title: string; body: string } {
  return { title: 'Balance updated', body: `${u.programName}: ${u.balance.toLocaleString('en-US')} ${u.unit}` };
}
