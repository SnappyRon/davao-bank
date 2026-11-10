import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { ChevronDown, Eye, EyeOff } from 'lucide-react-native';
import {
  colors,
  elevation,
  radius,
  size,
  typography,
  spacing,
  type AccountBalance,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { AmountText } from '../../components/AmountText';
import { Skeleton } from '../../components/Skeleton';
import { Pressable } from '../../components/Pressable';
import { Button } from '../../components/Button';
import { formatAccountLabel } from '../../components/AccountPickerSheet';

/** Spec 7B.6: the balance uses `display` at 400 pt and wider, `amount` below. */
const DISPLAY_AMOUNT_MIN_WIDTH = 400;
const AMOUNT_MAX_FONT_SCALE = 1.4;
const EYE_BUTTON_SIZE = size.touch;
/**
 * Skeleton height = the loaded card: padding 20 × 2, header row (44 pt eye
 * button), gap 16, eyebrow + gap 4 + amount, and the optional
 * "All accounts" line (gap 4 + label).
 */
function balanceCardHeight(amountLineHeight: number, withTotalLine: boolean): number {
  return (
    spacing.lg * 2 +
    EYE_BUTTON_SIZE +
    spacing.base +
    typography.caption.lineHeight +
    spacing.xs +
    amountLineHeight +
    (withTotalLine ? spacing.xs + typography.label.lineHeight : 0)
  );
}
const EYE_ICON_SIZE = 20;
const CHEVRON_SIZE = 16;

interface HomeBalanceCardProps {
  loading: boolean;
  /** User-facing message (already mapped by `toUserMessage`) when the balance load failed. */
  error: string | null;
  accounts: AccountBalance[];
  selectedAccount: AccountBalance | null;
  hideBalance: boolean;
  onOpenAccountPicker: () => void;
  onToggleHideBalance: () => void;
  onRetry: () => void;
}

export function HomeBalanceCard({
  loading,
  error,
  accounts,
  selectedAccount,
  hideBalance,
  onOpenAccountPicker,
  onToggleHideBalance,
  onRetry,
}: HomeBalanceCardProps) {
  const { width } = useWindowDimensions();
  const amountVariant = width >= DISPLAY_AMOUNT_MIN_WIDTH ? 'display' : 'amount';

  const hasMultipleAccounts = accounts.length > 1;

  if (loading && !error) {
    return (
      <Skeleton
        width="100%"
        height={balanceCardHeight(
          typography[amountVariant].lineHeight,
          hasMultipleAccounts
        )}
        style={styles.cardSkeleton}
      />
    );
  }

  // Never show ₱0.00 when the load failed: the card says the balance is unavailable.
  if (error) {
    return (
      <View style={styles.card}>
        <Text variant="caption" color={colors.primaryTint}>
          AVAILABLE BALANCE
        </Text>
        <View style={styles.errorText}>
          <Text variant="title" color={colors.textInverse} accessibilityRole="header">
            Balance unavailable
          </Text>
          <Text variant="caption" color={colors.primaryTint}>
            {error}
          </Text>
        </View>
        <Button title="Try again" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  const accountLabel = selectedAccount ? formatAccountLabel(selectedAccount) : null;
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  const pillContent = (
    <>
      <Text variant="label" color={colors.textInverse}>
        {accountLabel ?? 'No account yet'}
      </Text>
      {hasMultipleAccounts ? (
        <ChevronDown size={CHEVRON_SIZE} color={colors.textInverse} />
      ) : null}
    </>
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {hasMultipleAccounts ? (
          <Pressable
            style={styles.accountPill}
            onPress={onOpenAccountPicker}
            accessibilityRole="button"
            accessibilityLabel={`${accountLabel}. Change account`}
          >
            {pillContent}
          </Pressable>
        ) : (
          <View style={styles.accountPill}>{pillContent}</View>
        )}

        <Pressable
          onPress={onToggleHideBalance}
          style={styles.eyeButton}
          accessibilityRole="button"
          accessibilityLabel={hideBalance ? 'Show balance' : 'Hide balance'}
          hitSlop={0}
        >
          {hideBalance ? (
            <EyeOff size={EYE_ICON_SIZE} color={colors.textInverse} />
          ) : (
            <Eye size={EYE_ICON_SIZE} color={colors.textInverse} />
          )}
        </Pressable>
      </View>

      <View style={styles.amountBlock}>
        <Text variant="caption" color={colors.primaryTint}>
          AVAILABLE BALANCE
        </Text>
        {selectedAccount ? (
          <AmountText
            amountCentavos={selectedAccount.balance}
            hidden={hideBalance}
            variant={amountVariant}
            color={colors.textInverse}
            showSign={false}
            maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}
          />
        ) : (
          <Text variant="title" color={colors.textInverse}>
            No account yet
          </Text>
        )}
        {hasMultipleAccounts ? (
          <Text
            variant="label"
            color={colors.primaryTint}
            maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}
            accessibilityLabel={hideBalance ? 'All accounts, amount hidden' : undefined}
          >
            All accounts{' '}
            <AmountText
              amountCentavos={totalBalance}
              hidden={hideBalance}
              variant="label"
              color={colors.primaryTint}
              showSign={false}
            />
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSkeleton: {
    borderRadius: radius.lg,
  },
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.base,
    ...elevation.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    backgroundColor: colors.primaryPressed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  eyeButton: {
    width: EYE_BUTTON_SIZE,
    height: EYE_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: {
    gap: spacing.xs,
  },
  errorText: {
    gap: spacing.xs,
  },
});
