import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  colors,
  spacing,
  formatCentavosToPHP,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { AmountInput } from '../../components/AmountInput';
import { Chip } from '../../components/Chip';
import { RecipientChip } from '../../components/RecipientChip';
import { maskAccountNumber } from '../../utils/transactionDisplay';

export type TransferTiming = 'now' | 'later' | 'recurring';

interface TransferAmountStepProps {
  recipientAccountNumber: string;
  recipientNickname: string;
  amountStr: string;
  onAmountChange: (amount: string) => void;
  /** Inline validation shown under the amount field. */
  amountError?: string | null;
  reference: string;
  onReferenceChange: (ref: string) => void;
  selectedAccount: AccountBalance | undefined;
  hideBalance: boolean;
  timing: TransferTiming;
  onTimingChange: (timing: TransferTiming) => void;
  scheduledDate: string;
  onScheduledDateChange: (date: string) => void;
  frequency: ScheduledPaymentFrequency;
  onFrequencyChange: (freq: ScheduledPaymentFrequency) => void;
  maxRunsStr: string;
  onMaxRunsChange: (runs: string) => void;
}

/** "To Mama · •• 7943" or "To •• 7943". */
export function recipientLabel(accountNumber: string, nickname: string) {
  const masked = maskAccountNumber(accountNumber.trim());
  return nickname ? `${nickname} · ${masked}` : masked;
}

export function TransferAmountStep({
  recipientAccountNumber,
  recipientNickname,
  amountStr,
  onAmountChange,
  amountError,
  reference,
  onReferenceChange,
  selectedAccount,
  hideBalance,
  timing,
  onTimingChange,
  scheduledDate,
  onScheduledDateChange,
  frequency,
  onFrequencyChange,
  maxRunsStr,
  onMaxRunsChange,
}: TransferAmountStepProps) {
  return (
    <View style={styles.stepContainer}>
      <RecipientChip
        label={`To ${recipientLabel(recipientAccountNumber, recipientNickname)}`}
      />
      <AmountInput
        label="Amount"
        value={amountStr}
        onChangeText={onAmountChange}
        error={amountError || undefined}
        presetAmounts={[100, 500, 1000, 5000]}
        helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
      />

      <TextField
        label="Note (optional)"
        value={reference}
        onChangeText={onReferenceChange}
        placeholder="e.g. Rent"
        maxLength={60}
      />

      {/* Timing Selector (§C.4) */}
      <View style={styles.timingSection}>
        <Text variant="label" color={colors.textSecondary} style={styles.timingLabel}>
          When
        </Text>
        <View style={styles.chipRow}>
          <Chip
            label="Now"
            selected={timing === 'now'}
            onPress={() => onTimingChange('now')}
          />
          <Chip
            label="Later"
            selected={timing === 'later'}
            onPress={() => onTimingChange('later')}
          />
          <Chip
            label="Recurring"
            selected={timing === 'recurring'}
            onPress={() => onTimingChange('recurring')}
          />
        </View>
      </View>

      {timing !== 'now' && (
        <TextField
          label={timing === 'recurring' ? 'Start date' : 'Date'}
          value={scheduledDate}
          onChangeText={onScheduledDateChange}
          placeholder="YYYY-MM-DD"
          maxLength={10}
        />
      )}

      {timing === 'recurring' && (
        <View style={styles.recurringFields}>
          <View style={styles.chipRow}>
            <Chip
              label="Weekly"
              selected={frequency === 'weekly'}
              onPress={() => onFrequencyChange('weekly')}
            />
            <Chip
              label="Monthly"
              selected={frequency === 'monthly'}
              onPress={() => onFrequencyChange('monthly')}
            />
          </View>
          <TextField
            label="Number of payments (optional)"
            value={maxRunsStr}
            onChangeText={onMaxRunsChange}
            placeholder="e.g. 12"
            maxLength={3}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  timingSection: {
    marginTop: spacing.sm,
  },
  timingLabel: {
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  recurringFields: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
