import { DEFAULT_THEME_MODE, THEME_STORE_VERSION, migrateThemeState } from '@/utils/themeDefault';

describe('dark by default (2026-10-11)', () => {
  it('starts new installs in dark', () => {
    expect(DEFAULT_THEME_MODE).toBe('dark');
  });

  it('switches a setting saved before 1.0.5 to dark, once', () => {
    // Every phone that opened an older build has `light` saved whether or not anyone chose it.
    expect(migrateThemeState({ mode: 'light' }, 0)).toEqual({ mode: 'dark', chosen: false });
    expect(migrateThemeState({ mode: 'system' }, 0)).toEqual({ mode: 'dark', chosen: false });
    expect(migrateThemeState(undefined, 0)).toEqual({ mode: 'dark', chosen: false });
  });

  it('leaves a setting from this version alone, chosen or not', () => {
    expect(migrateThemeState({ mode: 'light', chosen: true }, THEME_STORE_VERSION)).toEqual({ mode: 'light', chosen: true });
    expect(migrateThemeState({ mode: 'dark', chosen: false }, THEME_STORE_VERSION)).toEqual({ mode: 'dark', chosen: false });
  });

  it('repairs a setting it cannot read', () => {
    expect(migrateThemeState({ mode: 'sepia', chosen: 'yes' }, THEME_STORE_VERSION)).toEqual({ mode: 'dark', chosen: false });
  });
});
