import React from 'react';
import {
  formatCentavosToPHP,
  type AccountBalance,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { ReviewCard } from '../../components/ReviewCard';
import { formatAccountLabel } from '../../components/AccountPickerSheet';
import { formatWhen } from '../../utils/moneyFlow';
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
  const balanceAfter = (selectedAccount?.balance || 0) - centavosAmount;
  return (
    <ReviewCard
      eyebrow={timing === 'now' ? "You're sending" : "You're scheduling"}
      amountCentavos={centavosAmount}
      rows={[
        {
          label: 'From',
          value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
          onPress: onChangeSource,
        },
        { label: 'To', value: recipientLabel(recipientAccountNumber, recipientNickname) },
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
  );
}
