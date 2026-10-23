import React from 'react';
import { colors, type AccountBalance, type AdminUserItem } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminNav } from '@/components/AdminNav';
import { AccountsClient } from './AccountsClient';

export const dynamic = 'force-dynamic';

export default async function AdminAccountsPage() {
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

  // Load accounts with derived authoritative balances from view
  const { data: accountsData } = await supabase
    .from('account_balances')
    .select('*')
    .order('account_number', { ascending: true });
  const accounts: AccountBalance[] = accountsData || [];

  // Load users to associate accounts with customer names
  const { data: usersData } = await supabase.rpc('admin_get_users');
  const users: AdminUserItem[] = usersData || [];

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
            Ledger &amp; Accounts
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              marginTop: '0.25rem',
            }}
          >
            Deposit Accounts &amp; Balance Adjustments
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: colors.textSecondary,
              marginTop: '0.25rem',
            }}
          >
            Manage customer deposit accounts, open new checking/savings facilities, freeze
            accounts under compliance review, and perform audited balance adjustments.
          </p>
        </div>

        <AccountsClient initialAccounts={accounts} users={users} />
      </main>
    </div>
  );
}
