import React from 'react';
import { colors } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminNav } from '@/components/AdminNav';
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
    // Collect accounts involved
    if (!txAccountsMap[entry.transaction_id]) {
      txAccountsMap[entry.transaction_id] = new Set<string>();
    }
    const accNum = accNumberMap[entry.account_id] || entry.account_id;
    txAccountsMap[entry.transaction_id].add(accNum);

    // Collect amount
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

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.background,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AdminNav adminEmail={user?.email} adminName={profile?.full_name} />

      <main
        style={{
          maxWidth: '1280px',
          width: '100%',
          margin: '0 auto',
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              color: colors.primary,
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Financial Monitoring &amp; Reversals
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              marginTop: '0.25rem',
            }}
          >
            Transaction Oversight &amp; Audit
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: colors.textSecondary,
              marginTop: '0.25rem',
            }}
          >
            Monitor real-time ledger activity, filter by status or transaction type,
            export audit CSV reports, and execute atomic compensating reversals.
          </p>
        </div>

        <TransactionsClient initialTransactions={rows} />
      </main>
    </div>
  );
}
