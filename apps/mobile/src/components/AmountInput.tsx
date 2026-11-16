import React, { useState } from 'react';
import { View, TextInput, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { CHIP_MIN_HEIGHT } from './Chip';

export interface AmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  presetChips?: number[]; // PHP amounts e.g. [500, 1000, 2000, 5000]
  presetAmounts?: number[]; // alias
  availableBalanceCentavos?: number;
  label?: string;
  helperText?: string;
  error?: string | null;
  style?: ViewStyle;
}

function formatAmountGrouping(input: string): string {
  const clean = input.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 2) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`;
  }
  return parts[0];
}

export function AmountInput({
  value,
  onChangeText,
  presetChips,
  presetAmounts,
  availableBalanceCentavos,
  label = 'Amount',
  helperText,
  error,
  style,
}: AmountInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const chips = presetAmounts || presetChips || [500, 1000, 2000, 5000];

  const handlePreset = (php: number) => {
    onChangeText(formatAmountGrouping(php.toString()));
  };

  const handleChange = (raw: string) => {
    onChangeText(formatAmountGrouping(raw));
  };

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <View style={styles.headerRow}>
          <Text variant="label" color={colors.textSecondary}>
            {label}
          </Text>
          {availableBalanceCentavos !== undefined ? (
            <Text variant="caption" color={colors.textMuted} tabularNums>
              Available: ₱
              {(availableBalanceCentavos / 100).toLocaleString('en-PH', {
                minimumFractionDigits: 2,
              })}
            </Text>
          ) : helperText ? (
            <Text variant="caption" color={colors.textMuted}>
              {helperText}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.inputBox,
          isFocused && styles.inputBoxFocused,
          Boolean(error) && styles.inputBoxError,
        ]}
      >
        <Text variant="amount" color={colors.ink} style={styles.currencyPrefix}>
          ₱
        </Text>
        <TextInput
          value={value}
          onChangeText={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.textInput}
        />
      </View>

      {error ? (
        <Text variant="caption" color={colors.redText} style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {chips && chips.length > 0 ? (
        <View style={styles.presetRow}>
          {chips.map((chipAmount) => (
            <Pressable
              key={chipAmount}
              onPress={() => handlePreset(chipAmount)}
              style={styles.chip}
              feedbackType="scale"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Set amount to ₱${chipAmount}`}
            >
              <Text
                variant="caption"
                color={colors.primary}
                tabularNums
                style={styles.chipText}
              >
                ₱{chipAmount.toLocaleString()}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  inputBoxFocused: {
    borderColor: colors.primary,
  },
  inputBoxError: {
    borderColor: colors.redText,
  },
  currencyPrefix: {
    marginRight: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: typography.amount.fontSize,
    lineHeight: typography.amount.lineHeight,
    fontFamily: typography.amount.fontFamily,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: CHIP_MIN_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontFamily: typography.fonts.semiBold,
  },
});
