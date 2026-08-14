import { isUnder13 } from '@/utils/age';

describe('isUnder13', () => {
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
