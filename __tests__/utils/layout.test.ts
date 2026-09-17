import {
  isLargeScreen, twoColumnWidth, thirdWidth, gridColumnsFor,
  contentMaxWidth, didSizeChange, crossedBreakpoint, LARGE_SCREEN_MIN,
  columnWidth, galleryColumnsFor, galleryCellWidth, feedColumnWidth, contentColumnStyle, usesReadingColumn, cardListColumnsFor,
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

  it.each(IPHONE_WIDTHS)('keeps 3 gallery columns, a full-width feed, and no column style at %ipt', (w) => {
    expect(galleryColumnsFor(w, PHONE_H)).toBe(3);
    expect(galleryCellWidth(w, 3)).toBe(thirdWidth(w));
    expect(columnWidth(w, 2)).toBe(twoColumnWidth(w));
    expect(feedColumnWidth(w, PHONE_H)).toBe(w);
    expect(contentColumnStyle(contentMaxWidth(w, PHONE_H))).toEqual({});
  });

  it.each(IPHONE_WIDTHS)('keeps trip card lists single-column at %ipt', (w) => {
    expect(cardListColumnsFor(w, PHONE_H)).toBe(1);
  });

  it('gives trip card lists 2 columns on iPad portrait and 3 in landscape', () => {
    expect(cardListColumnsFor(834, 1194)).toBe(2);
    expect(cardListColumnsFor(1194, 834)).toBe(3);
  });

  it('keeps the phone layout in iPad Split View and Slide Over, which are phone-width', () => {
    expect(isLargeScreen(320, 1024)).toBe(false);
    expect(isLargeScreen(507, 1366)).toBe(false);
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

  it('gives a third column and a reading measure on large screens', () => {
    expect(gridColumnsFor(626, 890)).toBe(3);
    expect(contentMaxWidth(626, 890)).toBe(700);
  });

  it('gives iPad a third column in portrait and a fourth in landscape', () => {
    expect(gridColumnsFor(834, 1194)).toBe(3); // iPad Pro 11" portrait
    expect(gridColumnsFor(1194, 834)).toBe(4); // landscape
    expect(gridColumnsFor(1032, 1376)).toBe(4); // iPad Pro 13" portrait
    expect(galleryColumnsFor(834, 1194)).toBe(4);
    expect(galleryColumnsFor(1194, 834)).toBe(5);
  });

  it('keeps grid cards a usable size on every iPad', () => {
    for (const [w, h] of [[744, 1133], [834, 1194], [1194, 834], [1032, 1376], [1376, 1032]]) {
      expect(columnWidth(w, gridColumnsFor(w, h))).toBeGreaterThanOrEqual(190);
    }
  });

  it('gives the feed a 9:16 column on large screens, never wider than the window', () => {
    expect(feedColumnWidth(834, 1194)).toBe(672);
    expect(feedColumnWidth(1194, 834)).toBe(469);
    expect(feedColumnWidth(600, 2000)).toBe(600);
  });

  it('centres a capped column on large screens', () => {
    expect(contentColumnStyle(700)).toEqual({ width: '100%', maxWidth: 700, alignSelf: 'center' });
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

describe('usesReadingColumn', () => {
  it('centres form and list screens', () => {
    expect(usesReadingColumn('root', '(wallet)')).toBe(true);
    expect(usesReadingColumn('root', 'notifications')).toBe(true);
    expect(usesReadingColumn('auth', 'sign-in')).toBe(true);
    expect(usesReadingColumn('tabs', 'create')).toBe(true);
  });

  it('leaves immersive, self-adapting, and modal screens full width', () => {
    expect(usesReadingColumn('tabs', 'index')).toBe(false);
    expect(usesReadingColumn('tabs', 'search')).toBe(false);
    expect(usesReadingColumn('tabs', 'explore')).toBe(false);
    expect(usesReadingColumn('auth', 'welcome')).toBe(false);
    expect(usesReadingColumn('auth', 'onboarding')).toBe(false);
    expect(usesReadingColumn('root', '(tabs)')).toBe(false);
    expect(usesReadingColumn('root', 'trip/ai-generating')).toBe(false);
    expect(usesReadingColumn('root', 'paywall')).toBe(false);
  });
});
