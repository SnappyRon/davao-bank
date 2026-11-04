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
