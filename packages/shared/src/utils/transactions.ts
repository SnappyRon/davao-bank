/**
 * Formats a transaction type code into a friendly, human-readable display label.
 * Covers all 7 database / model transaction types.
 */
export function typeLabel(type: string): string {
  switch (type?.toLowerCase()) {
    case 'transfer':
      return 'Transfer';
    case 'deposit':
      return 'Deposit';
    case 'withdrawal':
      return 'Withdrawal';
    case 'bill_payment':
      return 'Bill payment';
    case 'adjustment':
      return 'Adjustment';
    case 'reversal':
      return 'Reversal';
    case 'payment_request':
    case 'request':
      return 'Payment request';
    default:
      if (!type) return 'Transaction';
      return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  }
}

/**
 * Formats a transaction ID (e.g. UUID) into a clean customer reference like "DB-8F04-3910".
 */
export function formatReferenceId(id: string): string {
  if (!id) return '';
  const cleaned = id.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length < 8) return `DB-${cleaned.toUpperCase()}`;
  return `DB-${cleaned.slice(0, 4).toUpperCase()}-${cleaned.slice(4, 8).toUpperCase()}`;
}
