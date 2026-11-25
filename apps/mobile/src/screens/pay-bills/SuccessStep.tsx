import React from 'react';
import type { Biller } from '@davao-bank/shared';
import type { PaymentTiming } from '../../components/WhenPicker';
import { ResultView } from '../../components/ResultView';
import { resultRows, type ResultResponse } from '../../utils/resultReceipt';
interface SuccessStepProps {
  biller: Biller;
  reference: string;
  centavos: number;
  timing: PaymentTiming;
  scheduledDate: string;
  receiptTxId: string | null;
  serverResult?: ResultResponse | null;
  hideBalance: boolean;
  onDone: () => void;
  onPayAgain: () => void;
}
export function SuccessStep({
  timing,
  serverResult,
  hideBalance,
  onDone,
  onPayAgain,
}: SuccessStepProps) {
  const date = serverResult?.next_run_date || serverResult?.start_date;
  const title =
    timing === 'now'
      ? 'Bill paid'
      : date
        ? `Bill payment scheduled for ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Bill payment scheduled';
  return (
    <ResultView
      outcome={timing === 'now' ? 'completed' : 'scheduled'}
      title={title}
      amountCentavos={serverResult?.amount}
      details={serverResult ? resultRows(serverResult) : []}
      hideBalance={hideBalance}
      shareReceipt={!!serverResult}
      contextualActionTitle="Pay another bill"
      onContextualAction={onPayAgain}
      onDone={onDone}
    />
  );
}
