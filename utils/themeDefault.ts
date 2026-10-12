import type { ThemeMode } from '@/types';

/**
 * Dark is the default from 1.0.5 (the owner's call, 2026-10-11); light and system stay in Settings.
 * The saved setting is versioned: one saved before this version is switched to dark once,
 * because every phone that opened an older build has `light` saved whether anyone chose it or not.
 * From this version on, `chosen` marks a theme picked in Settings, which is never overridden.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
export const THEME_STORE_VERSION = 1;

const MODES: readonly ThemeMode[] = ['dark', 'light', 'system'];

export function migrateThemeState(persisted: unknown, fromVersion: number): { mode: ThemeMode; chosen: boolean } {
  if (fromVersion < THEME_STORE_VERSION) return { mode: DEFAULT_THEME_MODE, chosen: false };
  const p = (persisted ?? {}) as { mode?: unknown; chosen?: unknown };
  const mode = MODES.includes(p.mode as ThemeMode) ? (p.mode as ThemeMode) : null;
  if (!mode) return { mode: DEFAULT_THEME_MODE, chosen: false };
  return { mode, chosen: p.chosen === true };
}
