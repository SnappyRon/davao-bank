import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Pressable } from './Pressable';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'elevated' | 'flat' | 'primary' | 'subtle' | 'default';
  accessibilityLabel?: string;
}

export function Card({
  children,
  style,
  onPress,
  variant = 'flat',
  accessibilityLabel = 'Card',
}: CardProps) {
  const containerStyle = [
    styles.card,
    variant === 'primary' && styles.primaryCard,
    variant === 'elevated' && styles.elevatedCard,
    variant === 'subtle' && styles.subtleCard,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        feedbackType="scale"
        onPress={onPress}
        style={containerStyle}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subtleCard: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  elevatedCard: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
});
