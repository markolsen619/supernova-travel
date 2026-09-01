import { isUnder13 } from '@/utils/age';

describe('isUnder13', () => {
  // Pin "today" so these never depend on the calendar date the suite runs on.
  // Without this, setFullYear rolls Feb 29 -> Mar 1 and the birthday-boundary
  // assertions flip. 2026-06-15 is deliberately not near a month or year edge.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d;
  };

  it('returns true for a newborn', () => {
    expect(isUnder13(daysAgo(1))).toBe(true);
  });

  it('returns true one day before the 13th birthday', () => {
    const d = yearsAgo(13);
    d.setDate(d.getDate() + 1);
    expect(isUnder13(d)).toBe(true);
  });

  it('returns false exactly on the 13th birthday', () => {
    expect(isUnder13(yearsAgo(13))).toBe(false);
  });

  it('returns false for an adult', () => {
    expect(isUnder13(yearsAgo(30))).toBe(false);
  });
});
