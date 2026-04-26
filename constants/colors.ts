export const Colors = {
  // Base backgrounds
  background: {
    primary: '#0a0a1a',
    secondary: '#0d0d1f',
    elevated: '#1a0a3a',
    card: 'rgba(255, 255, 255, 0.05)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
  },

  // Brand palette
  brand: {
    purple: '#a78bfa',
    purpleLight: '#c4b5fd',
    purpleDark: '#7c3aed',
    pink: '#f472b6',
    pinkLight: '#f9a8d4',
    blue: '#60a5fa',
    blueLight: '#93c5fd',
  },

  // Accent
  accent: {
    teal: '#34d399',
    tealDark: '#059669',
    amber: '#fbbf24',
    amberDark: '#d97706',
  },

  // Gradients (arrays for LinearGradient)
  gradient: {
    aurora: ['#a78bfa', '#f472b6', '#60a5fa'] as string[],
    purplePink: ['#a78bfa', '#f472b6'] as string[],
    bluePurple: ['#60a5fa', '#a78bfa'] as string[],
    dark: ['#0a0a1a', '#1a0a3a'] as string[],
    card: ['rgba(167,139,250,0.1)', 'rgba(244,114,182,0.05)'] as string[],
  },

  // Text
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
    inverse: '#0a0a1a',
  },

  // Semantic
  semantic: {
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
  },

  // Tier badges
  tier: {
    free: 'rgba(255, 255, 255, 0.2)',
    pro: '#fbbf24',
    business: '#a78bfa',
  },

  // Utility
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
} as const;
