import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import {
  colors,
  radius,
  spacing,
  formatCentavosToPHP,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Pressable } from '../../components/Pressable';
import { ReviewCard } from '../../components/ReviewCard';
import { formatAccountLabel } from '../../components/AccountPickerSheet';
import { formatWhen } from '../../utils/moneyFlow';
import { usePayeeLookup } from '../../hooks/usePhase8Contracts';
import { recipientLabel, type TransferTiming } from './TransferAmountStep';

interface TransferReviewStepProps {
  centavosAmount: number;
  selectedAccount: AccountBalance | undefined;
  recipientAccountNumber: string;
  recipientNickname: string;
  reference: string;
  timing: TransferTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  maxRunsStr: string;
  hideBalance: boolean;
  /** Opens the account picker (only passed with 2+ accounts). */
  onChangeSource?: () => void;
}

function formatAccountTypeLabel(accountType: string): string {
  const clean = accountType.trim().toLowerCase();
  if (clean === 'savings') return 'Savings';
  if (clean === 'checking') return 'Checking';
  return accountType.trim();
}

/** Spec 7B.4 Review: the commit button lives in the screen's sticky footer. */
export function TransferReviewStep({
  centavosAmount,
  selectedAccount,
  recipientAccountNumber,
  recipientNickname,
  reference,
  timing,
  scheduledDate,
  frequency,
  maxRunsStr,
  hideBalance,
  onChangeSource,
}: TransferReviewStepProps) {
  // Owner decision D9: payee confirmation is queried and shown on Review only.
  const {
    payee,
    loading: payeeLoading,
    error: payeeError,
    retry: retryPayee,
  } = usePayeeLookup(recipientAccountNumber);

  const balanceAfter = (selectedAccount?.balance || 0) - centavosAmount;
  const accountHolderValue = payeeLoading ? 'Checking…' : payee?.masked_name || '';

  return (
    <View style={styles.container}>
      <ReviewCard
        eyebrow={timing === 'now' ? "You're sending" : "You're scheduling"}
        amountCentavos={centavosAmount}
        rows={[
          {
            label: 'From',
            value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            onPress: onChangeSource,
          },
          {
            label: 'To',
            value: recipientLabel(recipientAccountNumber, recipientNickname),
          },
          { label: 'Account holder', value: accountHolderValue },
          {
            label: 'Account type',
            value: payee?.account_type ? formatAccountTypeLabel(payee.account_type) : '',
          },
          { label: 'Note', value: reference.trim() },
          {
            label: 'When',
            value: formatWhen(timing, scheduledDate, frequency, maxRunsStr),
          },
          {
            label: 'Balance after',
            value:
              timing === 'now'
                ? hideBalance
                  ? '₱••••••'
                  : formatCentavosToPHP(balanceAfter)
                : '',
            valueAccessibilityLabel: hideBalance ? 'Amount hidden' : undefined,
          },
          { label: 'Fee', value: 'Free' },
        ]}
      />

      {payeeError ? (
        <View style={styles.payeeErrorBox}>
          <AlertCircle size={16} color={colors.textSecondary} />
          <Text
            variant="caption"
            color={colors.textSecondary}
            style={styles.payeeErrorText}
          >
            Couldn&apos;t check account holder name.
          </Text>
          <Pressable
            onPress={retryPayee}
            feedbackType="scale"
            accessibilityRole="button"
            accessibilityLabel="Try again checking account holder"
          >
            <Text variant="label" color={colors.primary}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  payeeErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  payeeErrorText: {
    flex: 1,
  },
});
