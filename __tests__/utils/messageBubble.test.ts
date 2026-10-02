import { bubbleColors } from '@/utils/messageBubble';
import { DarkColors, LightColors } from '@/constants/colors';

// WCAG relative luminance and contrast, for opaque #rrggbb colours.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('bubbleColors', () => {
  it.each([['dark', DarkColors], ['light', LightColors]] as const)(
    'keeps both sides of a conversation readable in %s mode (≥ 4.5:1)',
    (_mode, colors) => {
      for (const isMine of [true, false]) {
        const { background, text } = bubbleColors(isMine, colors);
        expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('sets your messages apart from theirs', () => {
    expect(bubbleColors(true, DarkColors).background).not.toBe(bubbleColors(false, DarkColors).background);
  });
});
