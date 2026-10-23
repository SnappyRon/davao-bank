import React from 'react';
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'elevated' | 'flat' | 'primary' | 'subtle' | 'default';
}

export function Card({ children, style, onPress, variant = 'flat' }: CardProps) {
  const containerStyle = [
    styles.card,
    variant === 'primary' && styles.primaryCard,
    variant === 'elevated' && styles.elevatedCard,
    variant === 'subtle' && styles.subtleCard,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={containerStyle}>
        {children}
      </TouchableOpacity>
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
