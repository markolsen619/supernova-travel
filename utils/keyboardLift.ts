/**
 * Android forms behind the keyboard (owner, 2026-11-05: "can't see what they're writing" in Additional preferences).
 * Android runs edge-to-edge (SDK 54), so the window no longer shrinks for the keyboard and
 * `automaticallyAdjustKeyboardInsets` is iOS-only. Shrinking the form with padding lets Android's own scroll view
 * bring the focused field into view (it does so whenever it gets shorter) — ScrollView, FlashList and the draggable
 * list's container alike. Pure; components/ui/KeyboardLift applies it.
 */
export const keyboardLiftBehavior = (os: string): 'padding' | undefined => (os === 'android' ? 'padding' : undefined);
