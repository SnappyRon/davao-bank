/**
 * Davao Bank Design System — Kadayawan 2026 Brand Palette Tokens
 *
 * Official Kadayawan 2026 Brand Palette (WCAG AA Compliant):
 * - Primary: #0C6D38 (Mt. Apo Deep Green) — Main buttons, active tab, links, credit amounts (6.4:1 contrast on white)
 * - Green: #03AA56 (Kadayawan Green) — Fills only (Cash-in tile)
 * - Red: #EF2D23 (Festive Red) — Fills only (destructive button, error icon)
 * - RedText: #C8102E — Error and destructive text (5.9:1)
 * - Orange: #FD4B12 (Solar Orange) — Fills only (Cash-out tile)
 * - OrangeText: #B83D0B — Warning text (5.2:1)
 * - Yellow: #FEAD0B (Kadayawan Yellow) — Fills only, always with ink text & icons
 * - Blue: #0099C8 (Davao Gulf Blue) — Fills only (Transfer tile)
 * - BlueText: #006E94 — Info text (5.7:1)
 * - Ink: #1A1A1A — Primary text, debit amounts
 * - Canvas: #F7F5F0 — App warm neutral canvas background
 * - Surface: #FFFFFF — Cards, sheets
 * - SurfaceSubtle: #EFECE6 — Inputs, inactive chips
 * - Border: #E4E0D8 — Dividers, outlines
 */

export const colors = {
  // 1. Kadayawan 2026 Core Brand & Action Tokens
  primary: '#0C6D38', // Mt. Apo deep green — Main buttons, active tab, links, credit amounts
  primaryPressed: '#09552B', // Pressed interactive state
  primaryTint: '#E3F2E8', // Selected chips, soft highlights, success badge background

  // 2. Kadayawan Feature & Tile Fills
  green: '#03AA56', // Fills only (Cash-in tile)
  red: '#EF2D23', // Fills only (destructive button, error icon)
  redText: '#C8102E', // Error & destructive text (5.9:1 contrast)
  orange: '#FD4B12', // Fills only (Cash-out tile)
  orangeText: '#B83D0B', // Warning text (5.2:1 contrast)
  yellow: '#FEAD0B', // Fills only (Activity/Rewards), always with ink text and icons on top
  blue: '#0099C8', // Fills only (Transfer tile)
  blueText: '#006E94', // Info text (5.7:1 contrast)

  // 3. Neutrals & Chrome
  ink: '#1A1A1A', // Primary text, debit amounts
  textSecondary: '#5C5A55', // Secondary supporting text
  textMuted: '#68655F', // Placeholders, non-essential hints
  textInverse: '#FFFFFF', // High-contrast text on solid fills
  canvas: '#F7F5F0', // App warm neutral canvas background
  surface: '#FFFFFF', // Cards, sheets, dialog surfaces
  surfaceSubtle: '#EFECE6', // Inputs, inactive chips
  border: '#E4E0D8', // Dividers, outlines
  borderFocus: '#0C6D38', // Focus rings

  // 4. Soft Tint Backgrounds (badges, icon circles)
  tintRed: '#FDE8E7',
  tintOrange: '#FFEDE4',
  tintYellow: '#FFF4DB',
  tintBlue: '#E1F3FA',

  // 5. Backwards-Compatibility Aliases
  background: '#F7F5F0', // Aliased to canvas
  textPrimary: '#1A1A1A', // Aliased to ink
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#EFECE6',
  error: '#EF2D23',
  errorLight: '#FDE8E7',
  errorDark: '#C8102E',
  warning: '#B83D0B',
  warningLight: '#FFF4DB',
  warningDark: '#B83D0B',
  info: '#006E94',
  infoLight: '#E1F3FA',
  success: '#0C6D38',
  successLight: '#E3F2E8',
  successDark: '#09552B',
  accent: '#FEAD0B',
  accentLight: '#FFF4DB',
  accentDark: '#B83D0B',
  primaryLight: '#E3F2E8',
  primaryDark: '#09552B',
  primaryMuted: '#0C6D38',
  neutral: '#1A1A1A',
  neutralLight: '#EFECE6',
  neutralDark: '#1A1A1A',
  neutralMuted: '#68655F',
  earth: '#5C5A55',
  earthLight: '#EFECE6',
  earthDark: '#1A1A1A',
} as const;

export type ColorToken = keyof typeof colors;

export interface ColorSwatchItem {
  id: string;
  name: string;
  culturalName: string;
  hex: string;
  role: string;
}

/**
 * Metadata describing the 5 official Kadayawan 2026 logo colors
 */
export const coreColorSwatches: ColorSwatchItem[] = [
  {
    id: 'primary',
    name: 'Deep Green',
    culturalName: 'Mt. Apo Forest Green',
    hex: colors.primary,
    role: 'Brand identity, main actions, credit amounts',
  },
  {
    id: 'red',
    name: 'Festive Red',
    culturalName: 'Waling-waling Crimson',
    hex: colors.red,
    role: 'Alerts, destructive actions, festive accents',
  },
  {
    id: 'orange',
    name: 'Solar Orange',
    culturalName: 'Mindanao Sunset Orange',
    hex: colors.orange,
    role: 'Cash-out tile, warnings, high-energy actions',
  },
  {
    id: 'yellow',
    name: 'Kadayawan Gold',
    culturalName: 'Harvest Festive Gold',
    hex: colors.yellow,
    role: 'Activity tile, value highlights (always with ink text)',
  },
  {
    id: 'blue',
    name: 'Davao Blue',
    culturalName: 'Davao Gulf Blue',
    hex: colors.blue,
    role: 'Transfer tile, digital payments, informational chips',
  },
];
