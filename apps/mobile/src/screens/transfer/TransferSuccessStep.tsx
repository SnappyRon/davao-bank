import React from 'react';
import {
  formatCentavosToPHP,
  type MoneyOperationResult,
  type ScheduledPaymentFrequency,
} from '@davao-bank/shared';
import { ResultView } from '../../components/ResultView';
import { resultRows, type ResultResponse } from '../../utils/resultReceipt';
import type { TransferTiming } from './TransferAmountStep';
interface TransferSuccessStepProps {
  successResult: MoneyOperationResult | null;
  scheduledResult: ResultResponse | null;
  isScheduledSuccess: boolean;
  timing: TransferTiming;
  scheduledDate: string;
  frequency: ScheduledPaymentFrequency;
  centavosAmount: number;
  recipientNickname: string;
  recipientAccountNumber: string;
  selectedAccountBalance?: number;
  hideBalance: boolean;
  onDone: () => void;
  onSendAgain: () => void;
}
export function TransferSuccessStep({
  successResult,
  scheduledResult,
  isScheduledSuccess,
  hideBalance,
  selectedAccountBalance,
  onDone,
  onSendAgain,
}: TransferSuccessStepProps) {
  const result = successResult || scheduledResult;
  if (!result && !isScheduledSuccess) return null;
  const date = scheduledResult?.next_run_date || scheduledResult?.start_date;
  const title =
    isScheduledSuccess && date
      ? `Transfer scheduled for ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : isScheduledSuccess
        ? 'Transfer scheduled'
        : 'Transfer sent';
  return (
    <ResultView
      outcome={isScheduledSuccess ? 'scheduled' : 'completed'}
      title={title}
      amountCentavos={result?.amount}
      hideBalance={hideBalance}
      details={[
        ...(result ? resultRows(result) : []),
        ...(selectedAccountBalance !== undefined && !isScheduledSuccess
          ? [
              {
                label: 'Balance now',
                value: hideBalance
                  ? '₱••••••'
                  : formatCentavosToPHP(selectedAccountBalance),
              },
            ]
          : []),
      ]}
      shareReceipt={!!result}
      contextualActionTitle="Send again"
      onContextualAction={onSendAgain}
      onDone={onDone}
    />
  );
}
