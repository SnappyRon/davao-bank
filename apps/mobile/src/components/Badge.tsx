import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@davao-bank/shared';
import { Text } from './Text';

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
}

export function Badge({ label, variant = 'neutral', icon, style }: BadgeProps) {
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
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text variant="caption" color={text} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 24,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fonts.semiBold,
  },
});
