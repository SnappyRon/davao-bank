import React from 'react';
import { View, StyleSheet, Animated, type ViewStyle } from 'react-native';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from './Text';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type?: ToastType;
  style?: ViewStyle;
}

export function Toast({ message, type = 'success', style }: ToastProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} color={colors.primary} />;
      case 'error':
        return <AlertCircle size={20} color={colors.redText} />;
      case 'info':
        return <Info size={20} color={colors.blueText} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return colors.primaryTint;
      case 'error':
        return colors.tintRed;
      case 'info':
        return colors.tintBlue;
    }
  };

  return (
    <View style={[styles.toast, { backgroundColor: getBackgroundColor() }, style]}>
      {getIcon()}
      <Text variant="bodyStrong" color={colors.ink} style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    marginVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  message: {
    flex: 1,
  },
});
