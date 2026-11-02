/**
 * Token Duplication & Consistency Verification Script (§Fix 8)
 * Ensures CSS custom properties in apps/admin/src/app/globals.css
 * are 100% synchronized with the authoritative Kadayawan tokens in @davao-bank/shared.
 */

import fs from 'node:fs';
import { colors, spacing, radius } from '../packages/shared/src';

const globalsPath = new URL('../apps/admin/src/app/globals.css', import.meta.url);
const cssContent = fs.readFileSync(globalsPath, 'utf8');

let errors = 0;

function checkToken(cssVar: string, expectedVal: string | number) {
  const regex = new RegExp(`${cssVar}\\s*:\\s*([^;]+);`, 'i');
  const match = cssContent.match(regex);
  if (!match) {
    console.error(`✗ Missing CSS token: ${cssVar} (expected: ${expectedVal})`);
    errors++;
    return;
  }

  const rawCssVal = match[1].trim();
  const normalizedExpected = String(expectedVal).trim().toLowerCase();
  const normalizedCssVal = rawCssVal.toLowerCase();

  // Allow px suffix matching for numbers (e.g. 16 -> 16px)
  if (
    normalizedCssVal !== normalizedExpected &&
    normalizedCssVal !== `${normalizedExpected}px`
  ) {
    console.error(
      `✗ Mismatch in ${cssVar}: CSS has "${rawCssVal}", shared tokens has "${expectedVal}"`
    );
    errors++;
  }
}

console.log('--- Verifying Design System Tokens (globals.css vs @davao-bank/shared) ---');

// 1. Color tokens
checkToken('--color-primary', colors.primary);
checkToken('--color-primary-pressed', colors.primaryPressed);
checkToken('--color-primary-tint', colors.primaryTint);
checkToken('--color-green', colors.green);
checkToken('--color-red', colors.red);
checkToken('--color-red-text', colors.redText);
checkToken('--color-orange', colors.orange);
checkToken('--color-orange-text', colors.orangeText);
checkToken('--color-yellow', colors.yellow);
checkToken('--color-blue', colors.blue);
checkToken('--color-blue-text', colors.blueText);
checkToken('--color-ink', colors.ink);
checkToken('--color-text-secondary', colors.textSecondary);
checkToken('--color-text-muted', colors.textMuted);
checkToken('--color-text-inverse', colors.textInverse);
checkToken('--color-canvas', colors.canvas);
checkToken('--color-surface', colors.surface);
checkToken('--color-surface-subtle', colors.surfaceSubtle);
checkToken('--color-border', colors.border);
checkToken('--color-border-focus', colors.borderFocus);
checkToken('--color-tint-red', colors.tintRed);
checkToken('--color-tint-orange', colors.tintOrange);
checkToken('--color-tint-yellow', colors.tintYellow);
checkToken('--color-tint-blue', colors.tintBlue);

// 2. Spacing tokens
checkToken('--space-xs', spacing.xs);
checkToken('--space-sm', spacing.sm);
checkToken('--space-md', spacing.md);
checkToken('--space-base', spacing.base);
checkToken('--space-lg', spacing.lg);
checkToken('--space-xl', spacing.xl);
checkToken('--space-2xl', spacing['2xl']);
checkToken('--space-3xl', spacing['3xl']);
checkToken('--space-4xl', spacing['4xl']);

// 3. Radius tokens
checkToken('--radius-sm', radius.sm);
checkToken('--radius-md', radius.md);
checkToken('--radius-lg', radius.lg);
checkToken('--radius-xl', radius.xl);
checkToken('--radius-pill', radius.pill);

if (errors > 0) {
  console.error(`\n❌ Token verification failed with ${errors} mismatch(es).`);
  process.exit(1);
} else {
  console.log(
    '✓ All CSS variables in globals.css match @davao-bank/shared tokens perfectly!\n'
  );
}
