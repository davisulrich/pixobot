// Design system tokens — single source of truth for all visual constants.
// Derived from Section 11 of the Pixobot PRD.

export const colors = {
  bg: '#F8F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EEE9',
  border: '#E5E2DB',
  textPrimary: '#1A1815',
  textSecondary: '#8A8580',
  textTertiary: '#B8B4AE',
  accent: '#F5C842',
  accentDark: '#1A1815',
  destructive: '#D94F4F',
} as const;

export const fontSize = {
  display: 32,
  title: 20,
  headline: 17,
  body: 15,
  caption: 13,
  label: 11,
} as const;

export const fontWeight = {
  display: '700' as const,
  title: '600' as const,
  headline: '500' as const,
  body: '400' as const,
  caption: '400' as const,
  label: '500' as const,
};

export const lineHeight = {
  display: 1.2,
  title: 1.2,
  body: 1.5,
} as const;

export const letterSpacing = {
  label: 0.08, // em — applied to uppercase nav labels and metadata tags
} as const;

export const radius = {
  card: 20,
  button: 50,  // fully rounded pill
  chip: 12,
  avatar: 999,
  input: 14,
  navPill: 32,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  screen: 48,
} as const;

export const shadow = {
  // Only used on the floating nav pill — no other shadows in the app
  navPill: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
