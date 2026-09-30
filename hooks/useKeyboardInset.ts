import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, type View } from 'react-native';
import { keyboardOverlap } from '@/utils/keyboardOverlap';

/**
 * Bottom padding that keeps a view's bottom edge above the keyboard, measured
 * on screen rather than assumed — correct inside page-sheet modals, where
 * KeyboardAvoidingView is not (see utils/keyboardOverlap). For a screen with
 * a bar pinned under its scroll view, like a comment composer; a scrolling
 * form should use automaticallyAdjustKeyboardInsets instead.
 *
 * iOS only. Android resizes the window for the keyboard itself.
 */
export function useKeyboardInset(ref: RefObject<View | null>): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      ref.current?.measureInWindow((_x, y, _w, height) => {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { type: LayoutAnimation.Types.keyboard },
        });
        setInset(keyboardOverlap({ y, height }, e.endCoordinates.screenY));
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      LayoutAnimation.configureNext({
        duration: e.duration,
        update: { type: LayoutAnimation.Types.keyboard },
      });
      setInset(0);
    });

    return () => {
      change.remove();
      hide.remove();
    };
  }, [ref]);

  return inset;
}
