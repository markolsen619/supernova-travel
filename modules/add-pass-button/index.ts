import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type AddPassButtonProps = ViewProps & {
  /** 'black' (default) or 'blackOutline' — the two styles Apple offers. */
  buttonStyle?: 'black' | 'blackOutline';
  onPress?: () => void;
};

/**
 * Apple's PKAddPassButton (modules/add-pass-button/ios). Null in builds without the native view (Expo Go, apps built
 * before it shipped), so callers render nothing instead of crashing.
 */
export const NativeAddPassButton: ComponentType<AddPassButtonProps> | null = (() => {
  // A build without the native module has no 'AddPassButton' in Expo's registry; requireNativeView would then
  // render an "unimplemented component" box instead of failing, so check first.
  const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  if (!registry?.AddPassButton) return null;
  try {
    return requireNativeView<AddPassButtonProps>('AddPassButton');
  } catch {
    return null;
  }
})();
