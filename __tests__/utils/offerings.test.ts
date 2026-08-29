import type { PurchasesPackage } from 'react-native-purchases';
import {
  sortPackages,
  annualSavingsPercent,
  buildPlanViews,
  defaultSelectedPlanId,
} from '@/utils/offerings';

// Minimal PurchasesPackage shape — only the fields these pure functions read.
function pkg(
  packageType: string,
  price: number,
  opts: { identifier?: string; priceString?: string; pricePerMonthString?: string | null } = {},
): PurchasesPackage {
  return {
    identifier: opts.identifier ?? `$rc_${packageType.toLowerCase()}`,
    packageType,
    product: {
      price,
      priceString: opts.priceString ?? `$${price.toFixed(2)}`,
      pricePerMonthString: opts.pricePerMonthString ?? null,
      title: `${packageType} plan`,
    },
  } as unknown as PurchasesPackage;
}

describe('sortPackages', () => {
  it('orders annual, monthly, lifetime regardless of input order', () => {
    const sorted = sortPackages([pkg('LIFETIME', 99), pkg('MONTHLY', 4.99), pkg('ANNUAL', 39.99)]);
    expect(sorted.map((p) => p.packageType)).toEqual(['ANNUAL', 'MONTHLY', 'LIFETIME']);
  });

  it('keeps unlisted package types, sorted to the end rather than dropped', () => {
    const sorted = sortPackages([pkg('WEEKLY', 1.99), pkg('ANNUAL', 39.99)]);
    expect(sorted.map((p) => p.packageType)).toEqual(['ANNUAL', 'WEEKLY']);
  });

  it('does not mutate its input', () => {
    const input = [pkg('LIFETIME', 99), pkg('ANNUAL', 39.99)];
    sortPackages(input);
    expect(input[0].packageType).toBe('LIFETIME');
  });
});

describe('annualSavingsPercent', () => {
  it('computes the saving against twelve months at the monthly rate', () => {
    // 4.99 * 12 = 59.88; 39.99 saves 19.89 => 33%
    expect(annualSavingsPercent(pkg('MONTHLY', 4.99), pkg('ANNUAL', 39.99))).toBe(33);
  });

  it('returns null when either plan is missing', () => {
    expect(annualSavingsPercent(undefined, pkg('ANNUAL', 39.99))).toBeNull();
    expect(annualSavingsPercent(pkg('MONTHLY', 4.99), undefined)).toBeNull();
  });

  it('returns null rather than a negative saving when annual costs more', () => {
    expect(annualSavingsPercent(pkg('MONTHLY', 1), pkg('ANNUAL', 99))).toBeNull();
  });

  it('returns null when the annual price exactly matches twelve months', () => {
    expect(annualSavingsPercent(pkg('MONTHLY', 5), pkg('ANNUAL', 60))).toBeNull();
  });

  it('returns null on a zero monthly price rather than dividing by zero', () => {
    expect(annualSavingsPercent(pkg('MONTHLY', 0), pkg('ANNUAL', 39.99))).toBeNull();
  });
});

describe('buildPlanViews', () => {
  const plans = buildPlanViews([
    pkg('LIFETIME', 99, { priceString: '$99.00' }),
    pkg('MONTHLY', 4.99, { priceString: '$4.99' }),
    pkg('ANNUAL', 39.99, { priceString: '$39.99', pricePerMonthString: '$3.33' }),
  ]);

  it('returns plans in display order', () => {
    expect(plans.map((p) => p.title)).toEqual(['Yearly', 'Monthly', 'Lifetime']);
  });

  it('attaches the savings badge only to the annual plan', () => {
    expect(plans[0].savingsPercent).toBe(33);
    expect(plans[1].savingsPercent).toBeNull();
    expect(plans[2].savingsPercent).toBeNull();
  });

  it('uses the store-formatted price string, never a hand-formatted one', () => {
    expect(plans.map((p) => p.priceString)).toEqual(['$39.99', '$4.99', '$99.00']);
  });

  it('shows a per-month equivalent for annual but not for monthly or lifetime', () => {
    expect(plans[0].perMonthString).toBe('$3.33');
    expect(plans[1].perMonthString).toBeNull();
    expect(plans[2].perMonthString).toBeNull();
  });

  it('flags the lifetime plan', () => {
    expect(plans.map((p) => p.isLifetime)).toEqual([false, false, true]);
  });

  it('handles an offering with only one plan', () => {
    const single = buildPlanViews([pkg('MONTHLY', 4.99)]);
    expect(single).toHaveLength(1);
    expect(single[0].savingsPercent).toBeNull();
  });

  it('returns an empty array for an offering with no packages', () => {
    expect(buildPlanViews([])).toEqual([]);
  });
});

describe('defaultSelectedPlanId', () => {
  it('pre-selects the annual plan when present', () => {
    const plans = buildPlanViews([pkg('MONTHLY', 4.99), pkg('ANNUAL', 39.99)]);
    expect(defaultSelectedPlanId(plans)).toBe('$rc_annual');
  });

  it('falls back to the first plan when there is no annual', () => {
    const plans = buildPlanViews([pkg('MONTHLY', 4.99), pkg('LIFETIME', 99)]);
    expect(defaultSelectedPlanId(plans)).toBe('$rc_monthly');
  });

  it('returns null when there are no plans', () => {
    expect(defaultSelectedPlanId([])).toBeNull();
  });
});
