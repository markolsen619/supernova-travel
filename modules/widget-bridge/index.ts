import { requireNativeModule } from 'expo';

type Bridge = { setEntries(json: string): void; saveImage(url: string, key: string): Promise<boolean>; reload(): void };

/**
 * The iPhone widget bridge (modules/widget-bridge/ios). A no-op in builds without it (Android, Expo Go, builds from
 * before the widget), so callers never need to check.
 */
export const WidgetBridge: Bridge = (() => {
  const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  if (registry?.WidgetBridge) {
    try {
      return requireNativeModule<Bridge>('WidgetBridge');
    } catch { /* fall through to the no-op */ }
  }
  return { setEntries: () => {}, saveImage: async () => false, reload: () => {} };
})();
