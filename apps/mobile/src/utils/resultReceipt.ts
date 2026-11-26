import { formatCentavosToPHP, formatReferenceId } from '@davao-bank/shared';

export type ResultResponse = {
  id?: string;
  transaction_id?: string;
  created_at?: string;
  amount?: number;
  from_account?: string;
  to_account?: string;
  account_number?: string;
  payer_account_number?: string;
  reference?: string;
  note?: string;
  start_date?: string;
  next_run_date?: string;
};
export type ResultRow = { label: string; value: string };

export function resultRows(
  data: ResultResponse,
  accountDirection?: 'To' | 'From'
): ResultRow[] {
  const rows: ResultRow[] = [];
  if (data.created_at && !Number.isNaN(Date.parse(data.created_at))) {
    rows.push({
      label: 'Date & time',
      value: new Date(data.created_at).toLocaleString(),
    });
  }
  const id = data.transaction_id || data.id;
  if (id) rows.push({ label: 'Reference no.', value: formatReferenceId(id) });
  const to = data.to_account || data.payer_account_number;
  const from = data.from_account;
  if (from) rows.push({ label: 'From', value: `•• ${from.slice(-4)}` });
  if (to) rows.push({ label: 'To', value: `•• ${to.slice(-4)}` });
  if (data.account_number && accountDirection)
    rows.push({ label: accountDirection, value: `•• ${data.account_number.slice(-4)}` });
  const note = data.note || data.reference;
  if (note) rows.push({ label: 'Note', value: note });
  return rows;
}

export function resultReceipt(
  title: string,
  amount: number | undefined,
  hideBalance: boolean,
  rows: ResultRow[]
): string {
  const lines = ['Davao Bank receipt', title];
  if (amount != null)
    lines.push(`Amount: ${hideBalance ? 'Hidden' : formatCentavosToPHP(amount)}`);
  return [...lines, ...rows.map((row) => `${row.label}: ${row.value}`)].join('\n');
}

/** A Postgres raised exception confirms that the server rejected the transaction.
 * Transport and step-up errors remain on the existing recovery path. */
export function isConfirmedRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P0001')
    return false;
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';
  return !message.includes('step_up_');
}
