import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export type BadgeVariant =
  'success' | 'error' | 'danger' | 'warning' | 'info' | 'neutral' | 'yellow';

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
        return { bg: colors.primaryTint, text: colors.primary };
      case 'danger':
      case 'error':
        return { bg: colors.tintRed, text: colors.redText };
      case 'warning':
        return { bg: colors.tintOrange, text: colors.orangeText };
      case 'info':
        return { bg: colors.tintBlue, text: colors.blueText };
      case 'yellow':
        return { bg: colors.tintYellow, text: colors.ink };
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
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 4,
  },
  text: {
    fontWeight: '700',
  },
});
