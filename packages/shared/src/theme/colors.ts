/**
 * Davao Bank Design System — Brand Palette Tokens
 *
 * Cultural Foundation (Proposal §5.3):
 * - Waling-waling orchid (Primary): Brand identity, headers, primary actions
 * - Mt. Apo forest green (Success): Safe/successful actions, financial growth
 * - Kadayawan festive gold (Accent): Value, balances, key highlights
 * - Cacao rich brown (Earth): Warm supporting tone, regional heritage
 * - Philippine Eagle slate (Neutral): Typography, neutral chrome, structural UI
 */

export const colors = {
  // Core Cultural Brand Tokens (Approved Proposal §5.3)
  primary: '#6A1B7A', // Waling-waling orchid — brand / headers / primary actions
  success: '#1C7A4D', // Mt. Apo green — safe/successful actions, growth
  accent: '#D99000', // Kadayawan gold — value, balances, highlights
  earth: '#5A3A22', // Cacao brown — warm supporting tone
  neutral: '#3A4A52', // Eagle slate — text / neutral UI

  // Sensible Tints & Interactive Shades
  primaryLight: '#F3E5F5',
  primaryDark: '#4A1256',
  primaryHover: '#551362',
  primaryMuted: '#9C27B0',

  successLight: '#E8F5E9',
  successDark: '#125233',
  successHover: '#15633E',

  accentLight: '#FFF8E1',
  accentDark: '#A66E00',
  accentHover: '#B87A00',

  earthLight: '#EFEBE9',
  earthDark: '#3E2718',

  neutralLight: '#ECEFF1',
  neutralMuted: '#607D8B',
  neutralDark: '#222D32',

  // Structural & Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  surfaceHover: '#F1F5F9',
  border: '#E2E8F0',
  borderFocus: '#6A1B7A',

  // Typography & Content
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // System & Alert Statuses
  error: '#DC2626',
  errorLight: '#FEF2F2',
  errorDark: '#991B1B',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  warningDark: '#92400E',
  info: '#0284C7',
  infoLight: '#E0F2FE',
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
 * Metadata for displaying the 5 core cultural tokens across demo screens
 */
export const coreColorSwatches: ColorSwatchItem[] = [
  {
    id: 'primary',
    name: 'Primary',
    culturalName: 'Waling-waling Orchid',
    hex: colors.primary,
    role: 'Brand / Headers / Primary Actions',
  },
  {
    id: 'success',
    name: 'Success',
    culturalName: 'Mt. Apo Green',
    hex: colors.success,
    role: 'Safe / Successful Actions / Growth',
  },
  {
    id: 'accent',
    name: 'Accent',
    culturalName: 'Kadayawan Gold',
    hex: colors.accent,
    role: 'Value / Balances / Highlights',
  },
  {
    id: 'earth',
    name: 'Earth',
    culturalName: 'Cacao Brown',
    hex: colors.earth,
    role: 'Warm Supporting Tone',
  },
  {
    id: 'neutral',
    name: 'Neutral',
    culturalName: 'Eagle Slate',
    hex: colors.neutral,
    role: 'Text / Neutral UI',
  },
];
