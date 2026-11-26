import { type TransactionHistoryItem } from '@davao-bank/shared';

/**
 * Display helpers for transaction rows and receipts (spec 7B.2).
 * Lists never show a full account number: only "•• 7943" (last 4 digits).
 */

export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return '';
  return `•• ${accountNumber.slice(-4)}`;
}

/**
 * Every reversal the database writes has the reference
 * "Reversal of <original transaction uuid>: <reason>" (see
 * `admin_reverse_transaction` in the migrations). This reads the original id
 * from that fixed format; anything else returns null. The reason is staff
 * text and is never shown to customers in lists.
 */
const REVERSAL_REFERENCE =
  /^Reversal of ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export function reversedTransactionId(item: TransactionHistoryItem): string | null {
  if (item.type !== 'reversal' || !item.reference) return null;
  const match = REVERSAL_REFERENCE.exec(item.reference);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Finds the original row a reversal row reverses, among the loaded items.
 * Prefers the original's ledger entry on the same account as the reversal row.
 */
export function findReversalOriginal(
  reversal: TransactionHistoryItem,
  items: TransactionHistoryItem[]
): TransactionHistoryItem | null {
  const originalId = reversedTransactionId(reversal);
  if (!originalId) return null;
  const candidates = items.filter(
    (item) => item.transaction_id.toLowerCase() === originalId
  );
  return (
    candidates.find((item) => item.account_id === reversal.account_id) ??
    candidates[0] ??
    null
  );
}

/** Builds a lookup from reversal ledger entry → original row. */
export function buildReversalOriginals(
  items: TransactionHistoryItem[]
): Map<string, TransactionHistoryItem> {
  const map = new Map<string, TransactionHistoryItem>();
  for (const item of items) {
    if (item.type !== 'reversal') continue;
    const original = findReversalOriginal(item, items);
    if (original) map.set(item.ledger_entry_id || item.transaction_id, original);
  }
  return map;
}

export function reversalOriginalFor(
  item: TransactionHistoryItem,
  originals: Map<string, TransactionHistoryItem>
): TransactionHistoryItem | undefined {
  return originals.get(item.ledger_entry_id || item.transaction_id);
}

/**
 * Short description of the original, used after "Reversal · ":
 * "Transfer to •• 8720", "Transfer from •• 8921", "Bill payment", …
 */
export function describeOriginal(original: TransactionHistoryItem): string {
  const masked = maskAccountNumber(original.counterparty_account_number);
  switch (original.type) {
    case 'transfer':
      if (!masked) return 'Transfer';
      return original.direction === 'credit'
        ? `Transfer from ${masked}`
        : `Transfer to ${masked}`;
    case 'bill_payment':
      return 'Bill payment';
    case 'deposit':
      return 'Money added';
    case 'withdrawal':
      return 'Cash out';
    case 'adjustment':
      return original.direction === 'credit' ? 'Bank credit' : 'Bank debit';
    default:
      return 'Transaction';
  }
}

/** Sentence-case row title (Wording table, 7B.7). */
export function transactionTitle(
  item: TransactionHistoryItem,
  original?: TransactionHistoryItem | null
): string {
  const masked = maskAccountNumber(item.counterparty_account_number);
  switch (item.type) {
    case 'transfer':
      if (item.direction === 'credit') {
        return masked ? `Received from ${masked}` : 'Money received';
      }
      return masked ? `Sent to ${masked}` : 'Money sent';
    case 'bill_payment':
      return item.biller_name ? `Bill payment · ${item.biller_name}` : 'Bill payment';
    case 'deposit':
      return 'Money added';
    case 'withdrawal':
      return 'Cash out';
    case 'adjustment':
      return item.direction === 'credit' ? 'Bank credit' : 'Bank debit';
    case 'reversal':
      return original ? `Reversal · ${describeOriginal(original)}` : 'Reversal';
    default:
      return 'Transaction';
  }
}

/**
 * Bill payments go to the internal billers account; its number is never
 * shown to customers (rows, receipts or shared text).
 */
export function hidesCounterparty(item: TransactionHistoryItem): boolean {
  return item.type === 'bill_payment';
}

/** "To •• 7943" / "From •• 8921", or null when there is no counterparty to show. */
export function counterpartyPhrase(item: TransactionHistoryItem): string | null {
  if (hidesCounterparty(item)) return null;
  const masked = maskAccountNumber(item.counterparty_account_number);
  if (!masked) return null;
  return item.direction === 'credit' ? `From ${masked}` : `To ${masked}`;
}

/** "2:41 AM" */
export function formatRowTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Note text a customer typed (the transaction reference). Reversal references
 * are staff text with an id, so they are never treated as a note.
 */
export function transactionNote(item: TransactionHistoryItem): string | null {
  if (item.type === 'reversal') return null;
  const note = item.reference?.trim();
  return note ? note : null;
}
