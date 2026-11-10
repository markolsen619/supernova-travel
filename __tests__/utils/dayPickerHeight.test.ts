import { dayPickerHeight } from '@/utils/dayPickerHeight';

describe('dayPickerHeight (device test 2026-11-10: the sheet had only a max height, came out 0 tall — a grey screen)', () => {
  it('fits a short trip\'s days', () => {
    expect(dayPickerHeight(3, 844)).toBe(132 + 3 * 61);
  });
  it('caps a long trip at 60% of the screen (the list scrolls)', () => {
    expect(dayPickerHeight(18, 844)).toBe(Math.round(844 * 0.6));
  });
  it('never collapses: a trip with no days still shows the sheet', () => {
    expect(dayPickerHeight(0, 844)).toBeGreaterThanOrEqual(220);
  });
});
