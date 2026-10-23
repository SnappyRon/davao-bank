import React from 'react';
import { type AccountBalance, type AdminUserItem } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
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
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Deposit & Ledger Accounts"
        subtitle="Manage deposit accounts, enforce freeze/close states, and perform audited balance adjustments."
      />
      <AccountsClient initialAccounts={accounts} allUsers={users} />
    </AdminShell>
  );
}
