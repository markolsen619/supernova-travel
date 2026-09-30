/**
 * How much of a view the keyboard covers, from the view's frame in window
 * coordinates and the keyboard's top edge (`endCoordinates.screenY`).
 *
 * Window coordinates are the point: React Native's KeyboardAvoidingView uses
 * the view's layout relative to its parent, which inside an iOS page-sheet
 * modal ignores the sheet's offset from the top of the screen and pads too
 * little — the comment bar on a post sat behind the keyboard.
 */
export function keyboardOverlap(frame: { y: number; height: number }, keyboardTop: number): number {
  return Math.max(0, frame.y + frame.height - keyboardTop);
}
