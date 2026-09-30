// Relative path: functions/ is a separate package; quotaUtils imports no firebase-admin.
import { FREE_TIER_YEARLY_IMPORT_LIMIT, multiCityAllowed } from '../../functions/src/quotaUtils';

describe('Pro-only server rules', () => {
  it('gives free accounts no AI imports — AI import is Pro', () => {
    expect(FREE_TIER_YEARLY_IMPORT_LIMIT).toBe(0);
  });

  it('allows extra destinations on an AI trip only for paid tiers', () => {
    expect(multiCityAllowed('free', 0)).toBe(true);
    expect(multiCityAllowed('free', 1)).toBe(false);
    expect(multiCityAllowed('pro', 3)).toBe(true);
    expect(multiCityAllowed('business', 3)).toBe(true);
    expect(multiCityAllowed(undefined, 2)).toBe(false);
  });
});
