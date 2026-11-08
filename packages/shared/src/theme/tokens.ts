import { colors } from './colors';

/**
 * Spacing Scale (Proposal §A.2): 4, 8, 12, 16, 20, 24, 32, 40, 48
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  screenSide: 20,
  lg: 20,
  xl: 24,
  section: 32,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

/**
 * Corner Radius Tokens (Proposal §A.2)
 * sm: 10, md: 16, lg: 24 (cards/tiles), xl: 32 (sheets), pill: 999 (buttons/chips)
 */
export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

/**
 * Typography Scale & Weights (Plus Jakarta Sans)
 * Weights: 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold)
 */
export const fontFamilies = {
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const typography = {
  fontFamily: fontFamilies.medium,
  fonts: fontFamilies,
  display: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: -1,
  },
  h1: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
  amount: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
} as const;

/**
 * Control and Touch Target Sizes (7A.2)
 */
export const size = {
  touch: 44,
  control: 52,
} as const;

/**
 * Elevation Shadows (7A.2)
 */
export const elevation = {
  card: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

/**
 * Motion Timings & Springs (7C)
 */
export const motion = {
  duration: {
    micro: 100,
    short: 150,
    medium: 250,
    long: 320,
    expressive: 480,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    enter: 'cubic-bezier(0, 0, 0, 1)',
    exit: 'cubic-bezier(0.3, 0, 1, 1)',
  },
  spring: {
    sheet: { damping: 26, stiffness: 260, mass: 1 },
    pop: { damping: 14, stiffness: 180, mass: 1 },
  },
} as const;

/**
 * Generates CSS Variables string for web / admin app styling
 */
export function generateCssVariables(): string {
  const colorVars = Object.entries(colors)
    .map(([key, value]) => `  --color-${kebabCase(key)}: ${value};`)
    .join('\n');

  const spacingVars = Object.entries(spacing)
    .map(([key, value]) => `  --space-${key}: ${value}px;`)
    .join('\n');

  const radiusVars = Object.entries(radius)
    .map(([key, value]) => `  --radius-${key}: ${value}px;`)
    .join('\n');

  return `:root {\n${colorVars}\n${spacingVars}\n${radiusVars}\n  --font-family: 'Plus Jakarta Sans', system-ui, sans-serif;\n}`;
}

function kebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
