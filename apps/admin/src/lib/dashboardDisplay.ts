import { formatReferenceId } from '@davao-bank/shared';

/** Presentation only: keep internal enum values out of dashboard copy. */
export function sentenceCase(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    deposit_completed: 'Money added',
    funds_transferred: 'Transfer sent',
    withdrawal_completed: 'Cash out completed',
    bill_payment_completed: 'Bill paid',
    transaction_reversed: 'Transaction reversed',
    admin_account_status_changed: 'Account status changed',
    admin_account_opened: 'Account opened',
    admin_user_status_changed: 'User status changed',
    user_mfa_reset: 'Two-step verification reset',
    admin_run_schedules_triggered: 'Scheduled payments run',
    balance_adjustment: 'Balance adjusted',
  };
  return labels[action] || sentenceCase(action);
}

export function ledgerReference(reference: string | null, id: string): string {
  const reversal = reference?.match(/^Reversal of ([0-9a-f-]{36})(?::|$)/i);
  if (reversal) return `Reversal of ${formatReferenceId(reversal[1])}`;
  // Internal notes are not displayed.
  return formatReferenceId(id);
}

export function auditEntity(value: string): string {
  const labels: Record<string, string> = {
    accounts: 'Account',
    transactions: 'Transaction',
    transfers: 'Transfer',
    payment_requests: 'Payment request',
    profiles: 'User',
    scheduled_payments: 'Scheduled payment',
    billers: 'Biller',
    saved_recipients: 'Saved recipient',
  };
  return labels[value] || sentenceCase(value);
}
