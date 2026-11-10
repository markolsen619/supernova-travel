/**
 * The "Add to which day?" sheet's height (device test 2026-11-10): with only a max height its flex children came out
 * 0 tall and the sheet showed as a bare grey backdrop. Header ≈ 132pt, a day row ≈ 61pt; at most 60% of the screen
 * (the list scrolls), never under 220pt.
 */
export function dayPickerHeight(dayCount: number, windowHeight: number): number {
  return Math.max(220, Math.min(Math.round(windowHeight * 0.6), 132 + dayCount * 61));
}
