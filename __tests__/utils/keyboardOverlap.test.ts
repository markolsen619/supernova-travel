import { keyboardOverlap } from '@/utils/keyboardOverlap';

describe('keyboardOverlap', () => {
  it('is how far the keyboard reaches above the bottom of the view', () => {
    // A page-sheet modal starts ~60pt down the screen; its bottom is still
    // the screen's bottom (932) while the keyboard top sits at 596.
    expect(keyboardOverlap({ y: 60, height: 872 }, 596)).toBe(336);
  });

  it('is zero when the keyboard is below the view', () => {
    expect(keyboardOverlap({ y: 0, height: 500 }, 596)).toBe(0);
    expect(keyboardOverlap({ y: 0, height: 932 }, 932)).toBe(0);
  });
});
