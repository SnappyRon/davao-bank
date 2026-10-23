import React from 'react';
import { type AdminUserItem, type AccountBalance } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
import { UsersClient } from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
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

  // Load all users via security definer RPC
  const { data: usersData } = await supabase.rpc('admin_get_users');
  const users: AdminUserItem[] = usersData || [];

  // Load all accounts to show customer holdings
  const { data: accountsData } = await supabase.from('account_balances').select('*');
  const accounts: AccountBalance[] = accountsData || [];

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="User & Customer Directory"
        subtitle="Manage customer profiles, enforcement status (suspensions), and account provisioning."
      />
      <UsersClient initialUsers={users} allAccounts={accounts} />
    </AdminShell>
  );
}
