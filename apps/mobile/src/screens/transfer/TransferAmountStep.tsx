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
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';

export type TransferTiming = 'now' | 'later' | 'recurring';

interface TransferAmountStepProps {
  amountStr: string;
  onAmountChange: (amount: string) => void;
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
  onBack: () => void;
  onReview: () => void;
}

export function TransferAmountStep({
  amountStr,
  onAmountChange,
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
  onBack,
  onReview,
}: TransferAmountStepProps) {
  return (
    <View style={styles.stepContainer}>
      <AmountInput
        label="Amount to Transfer"
        value={amountStr}
        onChangeText={onAmountChange}
        presetAmounts={[100, 500, 1000, 5000]}
        helperText={`Available: ${hideBalance ? '₱••••••' : formatCentavosToPHP(selectedAccount?.balance || 0)}`}
      />

      <TextField
        label="Note / Reference (Optional)"
        value={reference}
        onChangeText={onReferenceChange}
        placeholder="e.g. Rent, Groceries"
        maxLength={60}
      />

      {/* Timing Selector (§C.4) */}
      <View style={styles.timingSection}>
        <Text variant="label" color={colors.textSecondary} style={styles.timingLabel}>
          When to send
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
          label={timing === 'recurring' ? 'Start Date' : 'Scheduled Date'}
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
            label="Max Runs (optional)"
            value={maxRunsStr}
            onChangeText={onMaxRunsChange}
            placeholder="e.g. 12"
            maxLength={3}
          />
        </View>
      )}

      <View style={styles.navRow}>
        <Button title="Back" variant="ghost" onPress={onBack} style={styles.backButton} />
        <Button title="Review" onPress={onReview} style={styles.forwardButton} />
      </View>
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
  navRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  backButton: {
    flex: 1,
  },
  forwardButton: {
    flex: 2,
  },
});
