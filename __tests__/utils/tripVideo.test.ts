import { dayCaption, openingEyebrow } from '@/utils/tripVideo';

describe('trip video captions', () => {
  it('dates and length above the title', () => {
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 30), 6)).toBe('JUL 25 – 30 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 10, 28), new Date(2026, 11, 3), 6)).toBe('NOV 28 – DEC 3 · 6 DAYS');
    expect(openingEyebrow(new Date(2026, 6, 25), new Date(2026, 6, 25), 1)).toBe('JUL 25 · 1 DAY');
  });
  it('no dates: just the length', () => {
    expect(openingEyebrow(null, null, 4)).toBe('4 DAYS');
  });
  it('a day and its city', () => {
    expect(dayCaption(2, 'Lisbon')).toBe('DAY 2 · LISBON');
    expect(dayCaption(3, null)).toBe('DAY 3');
    expect(dayCaption(3, '  ')).toBe('DAY 3');
  });
});
