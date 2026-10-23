import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '@davao-bank/shared';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
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
        <Text variant="caption" color={colors.redText} style={styles.errorText}>
          {error}
        </Text>
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
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  inputContainer: {
    minHeight: 52,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.red,
  },
  input: {
    flex: 1,
    fontFamily: typography.fontFamily,
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
