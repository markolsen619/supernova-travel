import { Keyboard, TouchableWithoutFeedback, View, ViewProps } from 'react-native';

/**
 * A container whose empty space dismisses the keyboard on tap.
 *
 * Every scrollable in the app carries keyboardDismissMode="on-drag", which is
 * the primary mechanism — but it needs something to drag. A handful of screens
 * are a fixed KeyboardAvoidingView with no list at all (trip/new,
 * forgot-password, ai-generate, AddStopSheet, DatePickerModal), and on those
 * the keyboard had no dismissal path whatsoever: number-pad inputs don't even
 * carry a return key.
 *
 * Inner touchables keep working — TouchableWithoutFeedback only receives
 * presses that no child claimed. accessible={false} keeps the wrapper out of
 * the accessibility tree, which VoiceOver would otherwise announce as one
 * large button covering the whole screen.
 */
export function DismissKeyboardView({ style, children, ...rest }: ViewProps) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={style} {...rest}>
        {children}
      </View>
    </TouchableWithoutFeedback>
  );
}
