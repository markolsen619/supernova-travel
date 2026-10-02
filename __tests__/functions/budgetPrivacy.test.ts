import { budgetMigration } from '../../functions/src/budgetPrivacy';

describe('budgetMigration', () => {
  it('moves a budget an older app wrote onto the trip into the private doc, and strips it', () => {
    expect(budgetMigration({ title: 'x', budgetAmount: 2500, budgetCurrency: 'USD' }))
      .toEqual({ strip: true, budget: { amount: 2500, currency: 'USD' } });
  });
  it('strips a null budget without clearing the private one (older apps write null on every edit)', () => {
    expect(budgetMigration({ budgetAmount: null, budgetCurrency: null })).toEqual({ strip: true, budget: null });
  });
  it('defaults the currency, and ignores a nonsense amount', () => {
    expect(budgetMigration({ budgetAmount: 900 })).toEqual({ strip: true, budget: { amount: 900, currency: 'USD' } });
    expect(budgetMigration({ budgetAmount: -5 })).toEqual({ strip: true, budget: null });
    expect(budgetMigration({ budgetAmount: 'lots' })).toEqual({ strip: true, budget: null });
  });
  it('does nothing when the trip carries no budget fields — so its own write does not re-trigger it', () => {
    expect(budgetMigration({ title: 'x' })).toEqual({ strip: false, budget: null });
    expect(budgetMigration(undefined)).toEqual({ strip: false, budget: null });
  });
});
