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
 * Typography Scale & Weights (Proposal §A.2 — Plus Jakarta Sans)
 * Weights: 500, 600, 700, 800
 */
export const typography = {
  fontFamily: 'PlusJakartaSans',
  display: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: -1,
  },
  h1: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
} as const;

/**
 * Motion Timings (Proposal §A.2)
 */
export const motion = {
  pressDuration: 100,
  sheetDuration: 260,
  counterDuration: 600,
  checkDuration: 500,
  easing: 'ease-out',
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
