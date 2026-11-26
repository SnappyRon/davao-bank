import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type AccessibilityState,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Pressable } from './Pressable';
import { Text } from './Text';

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'destructive' | 'secondaryDestructive';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  /** Overrides the derived state, e.g. the Bantay chat Send button. */
  accessibilityState?: AccessibilityState;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  accessibilityLabel,
  accessibilityState,
}: ButtonProps) {
  const isInteractive = !disabled && !loading;

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    if (disabled) {
      return {
        backgroundColor: colors.surfaceSubtle,
        borderWidth: 0,
      };
    }

    switch (variant) {
      case 'primary':
        return {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
          borderWidth: 0,
        };
      case 'secondary':
        return {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
        };
      case 'secondaryDestructive':
        return {
          backgroundColor: pressed ? colors.tintRed : colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
        };
      case 'destructive':
        return {
          backgroundColor: pressed ? colors.red : colors.redText,
          borderWidth: 0,
        };
      case 'ghost':
        return {
          backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
          borderWidth: 0,
        };
    }
  };

  const getTextColor = (): string => {
    if (disabled) return colors.textMuted;
    switch (variant) {
      case 'primary':
      case 'destructive':
        return colors.textInverse;
      case 'secondary':
        return colors.ink;
      case 'secondaryDestructive':
        return colors.redText;
      case 'ghost':
        return colors.primary;
    }
  };

  const spinnerColor =
    variant === 'primary' || variant === 'destructive'
      ? colors.textInverse
      : variant === 'secondaryDestructive'
        ? colors.redText
        : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={
        accessibilityState ?? { disabled: !isInteractive, busy: loading }
      }
      disabled={!isInteractive}
      onPress={onPress}
      feedbackType={variant === 'primary' ? 'scale' : 'none'}
      pressedScale={0.98}
      style={({ pressed }) => [styles.base, getContainerStyle(pressed), style]}
    >
      <View style={styles.contentRow}>
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} style={styles.spinner} />
        ) : (
          icon && <View style={styles.iconBox}>{icon}</View>
        )}
        <Text
          variant="bodyStrong"
          color={getTextColor()}
          style={[styles.text, textStyle]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: spacing.sm,
  },
  iconBox: {
    marginRight: spacing.sm,
  },
  text: {
    textAlign: 'center',
  },
});
