import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  spacing,
  formatCentavosToPHP,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { TextField } from '../../components/TextField';
import { AmountInput } from '../../components/AmountInput';
import { WhenPicker, type PaymentTiming } from '../../components/WhenPicker';
import { RecipientChip } from '../../components/RecipientChip';
import { maskAccountNumber } from '../../utils/transactionDisplay';

export type TransferTiming = PaymentTiming;

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

      <WhenPicker
        timing={timing}
        onTimingChange={onTimingChange}
        scheduledDate={scheduledDate}
        onScheduledDateChange={onScheduledDateChange}
        frequency={frequency}
        onFrequencyChange={onFrequencyChange}
        maxRunsStr={maxRunsStr}
        onMaxRunsChange={onMaxRunsChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
});
