// Brand palette is shared across both themes
const brand = {
  purple: '#a78bfa',
  purpleLight: '#c4b5fd',
  purpleDark: '#7c3aed',
  pink: '#f472b6',
  pinkLight: '#f9a8d4',
  blue: '#60a5fa',
  blueLight: '#93c5fd',
};

const accent = {
  teal: '#34d399',
  tealDark: '#059669',
  amber: '#fbbf24',
  amberDark: '#d97706',
};

const semantic = {
  success: '#34d399',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#60a5fa',
};

const tier = {
  free: 'rgba(255, 255, 255, 0.2)',
  pro: '#fbbf24',
  business: '#a78bfa',
};

export const DarkColors = {
  background: {
    primary: '#0a0a1a',
    secondary: '#0d0d1f',
    elevated: '#1a0a3a',
    card: 'rgba(255, 255, 255, 0.05)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
  },
  brand,
  accent,
  gradient: {
    aurora: ['#a78bfa', '#f472b6', '#60a5fa'] as [string, string, string],
    purplePink: ['#a78bfa', '#f472b6'] as [string, string],
    bluePurple: ['#60a5fa', '#a78bfa'] as [string, string],
    dark: ['#0a0a1a', '#1a0a3a'] as [string, string],
    card: ['rgba(167,139,250,0.1)', 'rgba(244,114,182,0.05)'] as [string, string],
  },
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
    inverse: '#0a0a1a',
  },
  semantic,
  tier,
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  blurTint: 'dark' as 'dark' | 'light' | 'default',
};

export const LightColors = {
  background: {
    primary: '#fafafa',
    secondary: '#f1f0f7',
    elevated: '#ede9ff',
    card: 'rgba(0, 0, 0, 0.04)',
    cardBorder: 'rgba(0, 0, 0, 0.08)',
  },
  brand,
  accent,
  gradient: {
    aurora: ['#a78bfa', '#f472b6', '#60a5fa'] as [string, string, string],
    purplePink: ['#a78bfa', '#f472b6'] as [string, string],
    bluePurple: ['#60a5fa', '#a78bfa'] as [string, string],
    dark: ['#fafafa', '#ede9ff'] as [string, string],
    card: ['rgba(167,139,250,0.12)', 'rgba(244,114,182,0.06)'] as [string, string],
  },
  text: {
    primary: '#0a0a1a',
    secondary: 'rgba(10, 10, 26, 0.65)',
    tertiary: 'rgba(10, 10, 26, 0.4)',
    inverse: '#ffffff',
  },
  semantic,
  tier: {
    free: 'rgba(10, 10, 26, 0.15)',
    pro: '#d97706',
    business: '#7c3aed',
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  blurTint: 'light' as 'dark' | 'light' | 'default',
};

export type ThemeColors = typeof DarkColors;

// Backward-compat: existing imports of Colors still work (dark theme)
export const Colors = DarkColors;
