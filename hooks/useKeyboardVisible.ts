import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the software keyboard is currently on screen.
 *
 * Exists so a screen can tell "this tap was meant to dismiss the keyboard"
 * apart from "this tap was meant to do the thing it landed on". Without that
 * distinction the first tap after typing does both — which on the globe meant
 * dismissing the keyboard AND destroying the open place card in one gesture.
 *
 * iOS fires will/did around the animation; Android only ever fires did. Using
 * `will` on iOS means the flag flips before the tap that caused it is
 * processed, which is the whole point.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
