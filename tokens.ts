// Design system tokens — single source of truth for all visual constants.

export const colors = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  surfaceMuted: '#EDECE8',
  border: '#D0CEC8',
  borderStrong: '#1A1815',
  textPrimary: '#1A1815',
  textSecondary: '#8A8580',
  textTertiary: '#B8B4AE',
  accent: '#DCF763',
  accentDark: '#1A1815',
  destructive: '#D94F4F',
} as const;

export const fontSize = {
  display: 40,
  title: 32,
  headline: 17,
  body: 15,
  caption: 12,
  label: 10,
} as const;

export const fontWeight = {
  display: '800' as const,
  title: '800' as const,
  headline: '600' as const,
  body: '400' as const,
  caption: '400' as const,
  label: '600' as const,
};

export const lineHeight = {
  display: 1.0,
  title: 1.0,
  body: 1.5,
} as const;

export const letterSpacing = {
  caps: 1.5,
  label: 0.5,
} as const;

// All radii are 0 — straight lines only, editorial style
export const radius = {
  card: 0,
  button: 0,
  chip: 0,
  avatar: 0,
  input: 0,
  navPill: 0,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  screen: 56,
} as const;

export const shadow = {
  navPill: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;
