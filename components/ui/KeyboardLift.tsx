/** Wraps a form's scroll view so Android lifts the focused field above the keyboard (utils/keyboardLift). */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { keyboardLiftBehavior } from '@/utils/keyboardLift';

export function KeyboardLift({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const behavior = keyboardLiftBehavior(Platform.OS);
  return (
    <KeyboardAvoidingView behavior={behavior} enabled={!!behavior} style={[styles.fill, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
