import {
  isLargeScreen, twoColumnWidth, thirdWidth, gridColumnsFor,
  contentMaxWidth, didSizeChange, crossedBreakpoint, LARGE_SCREEN_MIN,
} from '@/utils/layout';

const IPHONE_WIDTHS = [375, 390, 393, 402, 430];
const PHONE_H = 852;

describe('the iPhone guarantee', () => {
  it.each(IPHONE_WIDTHS)('stays a phone layout at %ipt', (w) => {
    expect(isLargeScreen(w, PHONE_H)).toBe(false);
    expect(gridColumnsFor(w, PHONE_H)).toBe(2);
    expect(contentMaxWidth(w, PHONE_H)).toBeNull();
  });

  it.each(IPHONE_WIDTHS)('two-column width equals the old literal formula at %ipt', (w) => {
    expect(twoColumnWidth(w)).toBe((w - 48 - 12) / 2);
  });

  it.each(IPHONE_WIDTHS)('third width equals the old literal formula at %ipt', (w) => {
    expect(thirdWidth(w)).toBe(Math.floor(w / 3));
  });
});

describe('device classification', () => {
  it('treats the folded Duo as a phone', () => {
    expect(isLargeScreen(466, 678)).toBe(false);
  });
  it('treats the unfolded Duo as large', () => {
    expect(isLargeScreen(626, 890)).toBe(true);
  });
  it('treats every iPad as large', () => {
    expect(isLargeScreen(744, 1133)).toBe(true);
    expect(isLargeScreen(1024, 1366)).toBe(true);
  });
  it('keys on the smaller dimension, so a wide short screen is still a phone', () => {
    expect(isLargeScreen(900, 400)).toBe(false);
  });
  it('is inclusive at the threshold', () => {
    expect(isLargeScreen(LARGE_SCREEN_MIN, 900)).toBe(true);
    expect(isLargeScreen(LARGE_SCREEN_MIN - 1, 900)).toBe(false);
  });
});

describe('resize helpers', () => {
  it('detects a size change', () => {
    expect(didSizeChange({ width: 393, height: 852 }, { width: 393, height: 852 })).toBe(false);
    expect(didSizeChange({ width: 393, height: 852 }, { width: 626, height: 890 })).toBe(true);
  });

  it('detects only transitions that cross the threshold', () => {
    // unfold: phone -> large
    expect(crossedBreakpoint({ width: 466, height: 678 }, { width: 626, height: 890 })).toBe(true);
    // fold: large -> phone
    expect(crossedBreakpoint({ width: 626, height: 890 }, { width: 466, height: 678 })).toBe(true);
    // a resize that stays on the phone side
    expect(crossedBreakpoint({ width: 393, height: 852 }, { width: 430, height: 932 })).toBe(false);
    // a resize that stays on the large side (iPad split view)
    expect(crossedBreakpoint({ width: 744, height: 1133 }, { width: 1024, height: 1366 })).toBe(false);
  });
});
