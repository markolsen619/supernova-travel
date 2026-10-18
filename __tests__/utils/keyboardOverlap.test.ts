import { keyboardOverlap, keyboardOverScreenBottom } from '@/utils/keyboardOverlap';

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

describe('keyboardOverScreenBottom', () => {
  it('is how far the keyboard reaches up from the bottom of the screen', () => {
    // An RN <Modal> page sheet ends at the screen's bottom; measuring the sheet itself is
    // unreliable there (it reads as starting at y = 0), so only the keyboard is measured.
    expect(keyboardOverScreenBottom(596, 932)).toBe(336);
  });

  it('is zero when the keyboard is off screen (hidden, or a hardware keyboard)', () => {
    expect(keyboardOverScreenBottom(932, 932)).toBe(0);
    expect(keyboardOverScreenBottom(1000, 932)).toBe(0);
  });
});
