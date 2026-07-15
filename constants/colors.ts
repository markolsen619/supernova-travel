// Brand palette — shared across light/dark chrome. Per the light-editorial
// direction (see CLAUDE.md "UI/UX Design Philosophy" + .claude/skills/supernova-design),
// this is a jewel against neutrals, not wallpaper: the star mark, active/selected
// states, and at most one hero CTA per flow.
const brand = {
  purple: '#7F77DD',
  purpleLight: '#A6A0E8',
  purpleDark: '#5F56C7',
  pink: '#D4537E',
  pinkLight: '#E28FA9',
  // Not respecified by the redesign brief — kept as-is.
  blue: '#60a5fa',
  blueLight: '#93c5fd',
};

// Semantic/type icon colors (ACTIVITY_ICONS, RESERVATION_ICONS in constants/icons.ts
// embed these hexes directly and are unaffected by this file). Not respecified by
// the redesign brief — kept as-is; both read fine as icon colors on light or dark.
const accent = {
  teal: '#34d399',
  tealDark: '#059669',
  amber: '#fbbf24',
  amberDark: '#d97706',
};

export const DarkColors = {
  // Immersive-only palette (Mapbox globe/trip map, splash, AI-generating).
  // Never selected via the light/dark/system theme toggle — these screens
  // import DarkColors directly per Architecture Rule 3.
  background: {
    primary: '#0B0A12',    // void
    secondary: '#12101A',
    elevated: '#171422',
    card: 'rgba(255, 255, 255, 0.06)',
    cardBorder: '#26232E', // hairline
    sunken: '#171422',
  },
  brand,
  accent,
  action: {
    primary: '#7F77DD',
    primaryText: '#ffffff',
  },
  gradient: {
    aurora: [brand.purple, brand.pink, brand.blue] as [string, string, string],
    purplePink: [brand.purple, brand.pink] as [string, string],
    bluePurple: [brand.blue, brand.purple] as [string, string],
    dark: ['#0B0A12', '#171422'] as [string, string],
    card: ['rgba(127,119,221,0.12)', 'rgba(212,83,126,0.06)'] as [string, string],
  },
  text: {
    primary: '#F5F3F9',
    secondary: '#9C95AD',
    tertiary: 'rgba(245, 243, 249, 0.4)',
    disabled: 'rgba(245, 243, 249, 0.25)',
    inverse: '#ffffff',
  },
  semantic: {
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
  },
  tier: {
    free: 'rgba(255, 255, 255, 0.2)',
    pro: '#fbbf24',
    business: brand.purple,
  },
  // Trip status chips (trip/[id].tsx). Same bright-hue-on-translucent-tint
  // pattern the old inline STATUS_COLOR map used — dark screens don't render
  // these today, kept only for type parity with LightColors.status below.
  status: {
    planning: { text: accent.amber, bg: 'rgba(251, 191, 36, 0.16)' },
    active: { text: accent.teal, bg: 'rgba(52, 211, 153, 0.16)' },
    completed: { text: brand.blue, bg: 'rgba(96, 165, 250, 0.16)' },
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  blurTint: 'dark' as 'dark' | 'light' | 'default',
};

export const LightColors = {
  // Default palette — all app chrome except the immersive exceptions above.
  // Warm neutrals, deliberately not clinical white.
  background: {
    primary: '#FBF9F5',   // canvas
    secondary: '#F0EAE0',
    elevated: '#FFFFFF',
    card: '#FFFFFF',      // surface
    cardBorder: '#E5DDD2', // hairline — use with StyleSheet.hairlineWidth / 0.5px
    sunken: '#F0EAE0',    // chips, inset areas
  },
  brand,
  accent,
  action: {
    primary: '#1F1C19',
    primaryText: '#FBF9F5',
  },
  gradient: {
    aurora: [brand.purple, brand.pink, brand.blue] as [string, string, string],
    purplePink: [brand.purple, brand.pink] as [string, string],
    bluePurple: [brand.blue, brand.purple] as [string, string],
    dark: ['#FBF9F5', '#F0EAE0'] as [string, string],
    card: ['rgba(127,119,221,0.08)', 'rgba(212,83,126,0.04)'] as [string, string],
  },
  text: {
    primary: '#1F1C19',
    secondary: '#6B6157',
    tertiary: '#9A8F82',
    disabled: '#C4B8A8',
    inverse: '#FBF9F5', // text color for branded (purple) surfaces
  },
  // Not given explicit light-mode values by the redesign brief — darkened from
  // the dark-theme tones for ≥4.5:1 contrast on the #FBF9F5 canvas (skill's
  // accessibility floor). Standard, well-tested tones, not arbitrary picks.
  semantic: {
    success: '#16A34A',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',
  },
  // Unused anywhere in the app today — kept for API completeness.
  tier: {
    free: 'rgba(31, 28, 25, 0.1)',
    pro: '#D97706',
    business: brand.purple,
  },
  // Trip status chips (trip/[id].tsx) — dark text on a light tint, same
  // pattern as the activity-type icon bubbles, tuned for ≥4.5:1 contrast
  // (WCAG-computed): planning 6.37:1, active 6.49:1, completed 7.15:1.
  status: {
    planning: { text: '#92400E', bg: '#FEF3C7' },
    active: { text: '#166534', bg: '#DCFCE7' },
    completed: { text: '#1E40AF', bg: '#DBEAFE' },
  },
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  blurTint: 'light' as 'dark' | 'light' | 'default',
};

export type ThemeColors = typeof DarkColors;

// Backward-compat alias, now pointed at LightColors. Its original 4 call
// sites (Button, Badge, Avatar, (auth)/_layout) were all migrated to
// useTheme() over the course of the light-editorial rollout, so as of this
// repoint there are zero consumers left (verified via repo-wide grep) — this
// export is kept only in case older code or a future screen reaches for it.
export const Colors = LightColors;
