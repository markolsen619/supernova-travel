import {
  ACTIVITY_ICONS,
  RESERVATION_ICONS,
  LOYALTY_ICONS,
  PAYWALL_FEATURE_ICONS,
  TAB_ICONS,
} from '@/constants/icons';

describe('ACTIVITY_ICONS', () => {
  it('has an entry for every ActivityType', () => {
    const types = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
    types.forEach((t) => {
      expect(ACTIVITY_ICONS[t]).toBeDefined();
      expect(typeof ACTIVITY_ICONS[t].color).toBe('string');
      expect(ACTIVITY_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('RESERVATION_ICONS', () => {
  it('has an entry for every ReservationType', () => {
    const types = ['hotel', 'airbnb', 'rental_car', 'restaurant', 'activity'] as const;
    types.forEach((t) => {
      expect(RESERVATION_ICONS[t]).toBeDefined();
      expect(RESERVATION_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('LOYALTY_ICONS', () => {
  it('has an entry for every loyalty programType', () => {
    const types = ['airline', 'hotel', 'car_rental', 'credit_card', 'other'] as const;
    types.forEach((t) => {
      expect(LOYALTY_ICONS[t]).toBeDefined();
      expect(LOYALTY_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('PAYWALL_FEATURE_ICONS', () => {
  it('has 6 entries each with Icon, color, label, description', () => {
    expect(PAYWALL_FEATURE_ICONS).toHaveLength(6);
    PAYWALL_FEATURE_ICONS.forEach((f) => {
      expect(f.Icon).toBeDefined();
      expect(typeof f.color).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(typeof f.description).toBe('string');
    });
  });
});

describe('TAB_ICONS', () => {
  it('has icons for index, explore, search, profile', () => {
    ['index', 'explore', 'search', 'profile'].forEach((name) => {
      expect(TAB_ICONS[name]).toBeDefined();
    });
  });
  it('does not have an icon for create (gradient button)', () => {
    expect(TAB_ICONS['create']).toBeUndefined();
  });
});
