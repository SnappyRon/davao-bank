import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '@davao-bank/shared';
import { Text } from './Text';

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
  const chips = presetAmounts || presetChips || [500, 1000, 2000, 5000];

  const handlePreset = (php: number) => {
    onChangeText(php.toString());
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

      <View style={[styles.inputBox, Boolean(error) && styles.inputBoxError]}>
        <Text variant="display" color={colors.ink} style={styles.currencyPrefix}>
          ₱
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
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
            <TouchableOpacity
              key={chipAmount}
              onPress={() => handlePreset(chipAmount)}
              style={styles.chip}
              activeOpacity={0.8}
            >
              <Text
                variant="caption"
                color={colors.primary}
                tabularNums
                style={styles.chipText}
              >
                +₱{chipAmount.toLocaleString()}
              </Text>
            </TouchableOpacity>
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
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  inputBoxError: {
    borderColor: colors.red,
  },
  currencyPrefix: {
    marginRight: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: typography.display.fontSize,
    lineHeight: typography.display.lineHeight,
    fontWeight: typography.display.fontWeight,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  chipText: {
    fontWeight: '700',
  },
});
