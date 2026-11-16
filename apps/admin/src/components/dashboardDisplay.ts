/** Presentation only: keep internal enum values out of dashboard copy. */
export function sentenceCase(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    deposit_completed: 'Money added',
    transfer_completed: 'Transfer sent',
    withdrawal_completed: 'Cash out completed',
    bill_payment_completed: 'Bill paid',
    transaction_reversed: 'Transaction reversed',
    admin_reverse_transaction: 'Transaction reversed',
    balance_adjustment: 'Balance adjusted',
  };
  return labels[action] || sentenceCase(action);
}

export function ledgerReference(
  reference: string | null,
  id: string,
  formatReferenceId: (id: string) => string
): string {
  const reversal = reference?.match(/^Reversal of ([0-9a-f-]{36})(?::|$)/i);
  if (reversal) return `Reversal of ${formatReferenceId(reversal[1])}`;
  // Notes and internal reasons remain available in the tooltip only.
  return formatReferenceId(id);
}
