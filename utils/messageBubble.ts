import type { ThemeColors } from '@/constants/colors';

/**
 * A DM bubble's colours. Yours: the theme's primary text colour as the fill,
 * with the page background as the text, so it inverts cleanly in both modes.
 * It used to use `text.inverse`, which is white in dark mode as well, so your
 * own messages were white on near-white (1.1:1). Tested ≥ 4.5:1 in both themes.
 */
export function bubbleColors(isMine: boolean, colors: ThemeColors): { background: string; text: string } {
  return isMine
    ? { background: colors.text.primary, text: colors.background.primary }
    : { background: colors.background.sunken, text: colors.text.primary };
}
