import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography, motion } from '@davao-bank/shared';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  /** React 19: passed through `rest` to the inner TextInput (focus chaining). */
  ref?: React.Ref<React.ComponentRef<typeof TextInput>>;
}

export function TextField({
  label,
  helperText,
  error,
  containerStyle,
  leftElement,
  rightElement,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const errorOpacity = useSharedValue(reduceMotion || !error ? 1 : 0);
  const prevErrorRef = useRef(error);

  useEffect(() => {
    if (error && !prevErrorRef.current) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        // Haptics optional
      }
      if (!reduceMotion) {
        errorOpacity.value = 0;
        errorOpacity.value = withTiming(1, { duration: motion.duration.short });
      } else {
        errorOpacity.value = 1;
      }
    } else if (!error) {
      errorOpacity.value = 0;
    }
    prevErrorRef.current = error;
  }, [error, reduceMotion, errorOpacity]);

  const errorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: errorOpacity.value,
  }));

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" color={colors.ink} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          Boolean(error) && styles.inputError,
        ]}
      >
        {leftElement ? <View style={styles.left}>{leftElement}</View> : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          aria-invalid={Boolean(error)}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
      </View>

      {error ? (
        <Animated.View style={errorAnimatedStyle}>
          <Text
            variant="caption"
            color={colors.redText}
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        </Animated.View>
      ) : helperText ? (
        <Text variant="caption" color={colors.textMuted} style={styles.helperText}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    marginBottom: spacing.xs,
  },
  inputContainer: {
    minHeight: 52,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.redText,
  },
  input: {
    flex: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.ink,
    paddingVertical: spacing.md,
  },
  left: {
    marginRight: spacing.sm,
  },
  right: {
    marginLeft: spacing.sm,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  helperText: {
    marginTop: spacing.xs,
  },
});
