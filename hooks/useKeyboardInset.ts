import { useEffect, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type View } from 'react-native';
import { keyboardOverlap, keyboardOverScreenBottom } from '@/utils/keyboardOverlap';

/**
 * Bottom padding that keeps a view's bottom edge above the keyboard, measured
 * on screen rather than assumed — correct inside page-sheet modals, where
 * KeyboardAvoidingView is not (see utils/keyboardOverlap). For a screen with
 * a bar pinned under its scroll view, like a comment composer; a scrolling
 * form should use automaticallyAdjustKeyboardInsets instead.
 *
 * iOS only. Android resizes the window for the keyboard itself.
 *
 * Pass `ref: null` inside an RN `<Modal>` page sheet: there the view can't be measured on screen
 * (see keyboardOverScreenBottom), and the sheet's bottom is the screen's bottom anyway.
 */
export function useKeyboardInset(ref: RefObject<View | null> | null): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const apply = (next: number) => {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { type: LayoutAnimation.Types.keyboard },
        });
        setInset(next);
      };
      if (!ref) {
        apply(keyboardOverScreenBottom(e.endCoordinates.screenY, Dimensions.get('screen').height));
        return;
      }
      ref.current?.measureInWindow((_x, y, _w, height) => {
        apply(keyboardOverlap({ y, height }, e.endCoordinates.screenY));
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
