import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import {
  colors,
  radius,
  spacing,
  typography,
  type TransactionStatus,
} from '@davao-bank/shared';
import { Text } from './Text';

/** Spec 7A.3 / 7B.2: 24 pt tall, label 12/600, sentence case. */
const BADGE_HEIGHT = 24;
const MAX_BADGE_TEXT_SCALE = 1.4;

export type BadgeVariant =
  | 'success'
  | 'error'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'yellow'
  | 'completed'
  | 'pending'
  | 'scheduled'
  | 'failed'
  | 'reversed'
  | 'cancelled';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function Badge({ label, variant = 'neutral', icon, style, testID }: BadgeProps) {
  const getBadgeStyle = () => {
    switch (variant) {
      case 'success':
      case 'completed':
        return { bg: colors.primaryTint, text: colors.primary };
      case 'danger':
      case 'error':
      case 'failed':
        return { bg: colors.tintRed, text: colors.redText };
      case 'warning':
      case 'pending':
        return { bg: colors.tintOrange, text: colors.orangeText };
      case 'info':
      case 'scheduled':
        return { bg: colors.tintBlue, text: colors.blueText };
      case 'yellow':
        return { bg: colors.tintYellow, text: colors.ink };
      case 'reversed':
      case 'cancelled':
      case 'neutral':
      default:
        return { bg: colors.surfaceSubtle, text: colors.textSecondary };
    }
  };

  const { bg, text } = getBadgeStyle();

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]} testID={testID}>
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text
        variant="caption"
        color={text}
        style={styles.text}
        maxFontSizeMultiplier={MAX_BADGE_TEXT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Badge for a transaction status. "Completed" shows only on receipts, never in
 * lists (spec 7B.2), so lists get `null` for completed rows.
 */
export function transactionStatusBadge(
  status: TransactionStatus,
  context: 'list' | 'receipt'
): { label: string; variant: BadgeVariant } | null {
  switch (status) {
    case 'completed':
      return context === 'receipt' ? { label: 'Completed', variant: 'completed' } : null;
    case 'pending':
      return { label: 'Pending', variant: 'pending' };
    case 'failed':
      return { label: 'Failed', variant: 'failed' };
    case 'reversed':
      return { label: 'Reversed', variant: 'reversed' };
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  badge: {
    minHeight: BADGE_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: spacing.xs,
  },
  text: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontFamily: typography.fonts.semiBold,
    fontWeight: typography.label.fontWeight,
  },
});
