import React from 'react';
import { Download } from 'lucide-react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader, Button } from '@/components/ui';
import { TransactionsClient, type AdminTransactionRow } from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function AdminTransactionsPage() {
  const supabase = await createAdminCookieServerClient();

  // Admin user info
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id || '')
    .maybeSingle();

  // Query all transactions
  const { data: transactionsData } = await supabase
    .from('transactions')
    .select('id, type, status, initiated_by, idempotency_key, reference, created_at')
    .order('created_at', { ascending: false });

  // Query ledger entries to map amounts and accounts involved
  const { data: ledgerData } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, direction, amount');

  // Query account numbers for involved accounts lookup
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, account_number');

  const accNumberMap: Record<string, string> = {};
  (accountsData || []).forEach((a) => {
    accNumberMap[a.id] = a.account_number;
  });

  const txAmountMap: Record<string, number> = {};
  const txAccountsMap: Record<string, Set<string>> = {};

  (ledgerData || []).forEach((entry) => {
    if (!txAccountsMap[entry.transaction_id]) {
      txAccountsMap[entry.transaction_id] = new Set<string>();
    }
    const accNum = accNumberMap[entry.account_id] || entry.account_id;
    txAccountsMap[entry.transaction_id].add(accNum);

    if (!txAmountMap[entry.transaction_id]) {
      txAmountMap[entry.transaction_id] = Number(entry.amount);
    }
  });

  const rows: AdminTransactionRow[] = (transactionsData || []).map((tx) => ({
    id: tx.id,
    type: tx.type,
    status: tx.status,
    initiated_by: tx.initiated_by,
    idempotency_key: tx.idempotency_key,
    reference: tx.reference,
    created_at: tx.created_at,
    amount: txAmountMap[tx.id] || 0,
    accounts_involved: Array.from(txAccountsMap[tx.id] || []),
  }));

  // Query all payment requests (§D.3)
  const { data: requestsData } = await supabase
    .from('payment_requests')
    .select('*')
    .order('created_at', { ascending: false });

  const requests = (requestsData || []).map((r: any) => ({
    id: r.id,
    requester_id: r.requester_id,
    requester_account: r.requester_account,
    requester_account_number: accNumberMap[r.requester_account] || r.requester_account,
    payer_account_number: r.payer_account_number,
    payer_user_id: r.payer_user_id,
    amount: Number(r.amount),
    note: r.note,
    status: r.status,
    transaction_id: r.transaction_id,
    expires_at: r.expires_at,
    created_at: r.created_at,
    responded_at: r.responded_at,
  }));

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Transaction Oversight & Reversals"
        subtitle="Monitor ledger activity, inspect receipts, and oversee customer payment requests."
      >
        <a href="/api/export/transactions">
          <Button variant="secondary" icon={<Download size={16} />}>
            Export Ledger CSV
          </Button>
        </a>
      </PageHeader>
      <TransactionsClient initialTransactions={rows} initialRequests={requests} />
    </AdminShell>
  );
}
