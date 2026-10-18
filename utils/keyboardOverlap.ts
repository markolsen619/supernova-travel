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

/**
 * How far the keyboard reaches up from the bottom of the screen: what it covers of a view whose
 * bottom is the screen's bottom. For RN `<Modal presentationStyle="pageSheet">`, where (New
 * Architecture) measuring the sheet's content reads as if the sheet started at the top of the
 * screen, so `keyboardOverlap` came out short by the sheet's top gap and Nova's text field stayed
 * behind the keyboard (build 40). A keyboard at or below the screen's bottom covers nothing.
 */
export function keyboardOverScreenBottom(keyboardTop: number, screenHeight: number): number {
  return Math.max(0, screenHeight - keyboardTop);
}
