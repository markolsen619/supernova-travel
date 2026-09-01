import type { PurchasesPackage } from 'react-native-purchases';

/**
 * Display order on the paywall. Annual leads because it's the plan to sell;
 * lifetime sits last because it's the rarest choice and the biggest number.
 * Anything not listed (weekly, 3-month, a CUSTOM package) sorts to the end
 * rather than being dropped — a package configured in the dashboard should
 * always be purchasable, even if this list hasn't caught up with it.
 */
const ORDER: readonly string[] = ['ANNUAL', 'MONTHLY', 'LIFETIME'];

export interface PlanView {
  /** Package identifier — the stable key for lists and for purchase(). */
  id: string;
  /** "Yearly" / "Monthly" / "Lifetime" — sentence case, per the design rules. */
  title: string;
  /** Localised total price, formatted by the store. Never hand-formatted. */
  priceString: string;
  /**
   * The per-month equivalent for a multi-month plan ("$3.33 / month"), or null
   * for monthly and lifetime where it would just restate the headline price.
   */
  perMonthString: string | null;
  /** True for the non-consumable lifetime unlock, which never renews. */
  isLifetime: boolean;
  /** Percent saved vs paying monthly, when both plans exist. */
  savingsPercent: number | null;
  /** The package to hand to Purchases.purchasePackage(). */
  pkg: PurchasesPackage;
}

function titleFor(packageType: string, fallback: string): string {
  switch (packageType) {
    case 'ANNUAL':
      return 'Yearly';
    case 'MONTHLY':
      return 'Monthly';
    case 'LIFETIME':
      return 'Lifetime';
    case 'WEEKLY':
      return 'Weekly';
    case 'SIX_MONTH':
      return 'Six months';
    case 'THREE_MONTH':
      return 'Three months';
    case 'TWO_MONTH':
      return 'Two months';
    default:
      return fallback;
  }
}

export function sortPackages(packages: PurchasesPackage[]): PurchasesPackage[] {
  return [...packages].sort((a, b) => {
    const ai = ORDER.indexOf(a.packageType);
    const bi = ORDER.indexOf(b.packageType);
    // -1 (unlisted) must sort last, not first.
    return (ai === -1 ? ORDER.length : ai) - (bi === -1 ? ORDER.length : bi);
  });
}

/**
 * Savings of an annual plan vs 12x the monthly plan, rounded to a whole
 * percent. Returns null when either plan is missing or the annual isn't
 * actually cheaper — showing "save 0%" or a negative saving is worse than
 * showing nothing.
 */
export function annualSavingsPercent(
  monthly: PurchasesPackage | undefined,
  annual: PurchasesPackage | undefined,
): number | null {
  if (!monthly || !annual) return null;
  const yearAtMonthlyRate = monthly.product.price * 12;
  if (yearAtMonthlyRate <= 0) return null;
  const saved = yearAtMonthlyRate - annual.product.price;
  if (saved <= 0) return null;
  return Math.round((saved / yearAtMonthlyRate) * 100);
}

/**
 * Offering packages -> ordered view models for the paywall. Pure so the
 * ordering, labelling and savings maths are unit-testable without a renderer
 * or the native module (this project has no component-testing library).
 */
export function buildPlanViews(packages: PurchasesPackage[]): PlanView[] {
  const monthly = packages.find((p) => p.packageType === 'MONTHLY');
  const annual = packages.find((p) => p.packageType === 'ANNUAL');
  const savings = annualSavingsPercent(monthly, annual);

  return sortPackages(packages).map((pkg) => {
    const isLifetime = pkg.packageType === 'LIFETIME';
    const isMonthly = pkg.packageType === 'MONTHLY';
    return {
      id: pkg.identifier,
      title: titleFor(pkg.packageType, pkg.product.title),
      priceString: pkg.product.priceString,
      // Store-provided; null on monthly/lifetime where it adds nothing.
      perMonthString:
        isLifetime || isMonthly ? null : (pkg.product.pricePerMonthString ?? null),
      isLifetime,
      savingsPercent: pkg.packageType === 'ANNUAL' ? savings : null,
      pkg,
    };
  });
}

/** The plan to pre-select. Annual when present — the one we want chosen. */
export function defaultSelectedPlanId(plans: PlanView[]): string | null {
  if (plans.length === 0) return null;
  const annual = plans.find((p) => p.pkg.packageType === 'ANNUAL');
  return (annual ?? plans[0]).id;
}
