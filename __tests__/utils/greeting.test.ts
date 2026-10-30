import { band, firstName, greeting } from '@/utils/greeting';

const at = (iso: string) => new Date(iso); // local time (no Z)

describe('band', () => {
  it('edges', () => {
    expect([band(4), band(5), band(11), band(12), band(16), band(17), band(21), band(22), band(0)])
      .toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });
});

describe('greeting', () => {
  it('the same all day within a band', () => {
    expect(greeting({ name: 'Mark', now: at('2026-10-29T07:00:00') })).toBe(greeting({ name: 'Mark', now: at('2026-10-29T10:59:00') }));
  });
  it('varies from day to day', () => {
    const week = Array.from({ length: 10 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 9, 20 + i, 8) }));
    expect(new Set(week).size).toBeGreaterThan(1);
  });
  it('always names the person and never shouts', () => {
    for (let i = 0; i < 30; i++) {
      const g = greeting({ name: 'Mark', now: new Date(2026, 9, i + 1, 8 + (i % 14)) });
      expect(g).toContain('Mark');
      expect(g).not.toContain('!');
    }
  });
  it('no name: a greeting without one', () => {
    const g = greeting({ name: null, now: at('2026-10-29T08:00:00') });
    expect(g).not.toMatch(/,\s*$/);
    expect(g).not.toContain('null');
  });
  it('on a trip in Portugal, some mornings say Bom dia; unknown countries stay English', () => {
    const days = Array.from({ length: 12 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 10, 1 + i, 8), countryCode: 'PT' }));
    expect(days.some((g) => g.startsWith('Bom dia'))).toBe(true);
    expect(days.some((g) => !g.startsWith('Bom dia'))).toBe(true);
    const zz = Array.from({ length: 12 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 10, 1 + i, 8), countryCode: 'ZZ' }));
    expect(zz.every((g) => /^[A-Z][a-z]/.test(g) && !g.startsWith('Bom'))).toBe(true);
  });
});

it('firstName', () => {
  expect(firstName('Mark Olsen')).toBe('Mark');
  expect(firstName('  ')).toBeNull();
  expect(firstName(null)).toBeNull();
});

import { msUntilNextChange } from '@/utils/greeting';

describe('msUntilNextChange (final review: Home must not stay on yesterday)', () => {
  it('to the next band edge or midnight, whichever is first', () => {
    expect(msUntilNextChange(new Date(2026, 9, 29, 22, 30))).toBe(90 * 60_000);       // → midnight
    expect(msUntilNextChange(new Date(2026, 9, 29, 4, 59))).toBe(60_000);             // → 05:00 morning
    expect(msUntilNextChange(new Date(2026, 9, 29, 11, 0, 30))).toBe(59.5 * 60_000);    // → 12:00 afternoon
    expect(msUntilNextChange(new Date(2026, 9, 29, 17, 0))).toBe(5 * 3_600_000);       // → 22:00 night
  });
});
