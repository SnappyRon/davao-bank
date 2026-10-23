import React from 'react';
import { colors, type AdminUserItem, type AccountBalance } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminNav } from '@/components/AdminNav';
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
            User Administration
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              marginTop: '0.25rem',
            }}
          >
            Customer &amp; Staff Management
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: colors.textSecondary,
              marginTop: '0.25rem',
            }}
          >
            Inspect customer profiles, review email verification states, manage account
            privileges, and open deposit accounts.
          </p>
        </div>

        <UsersClient initialUsers={users} allAccounts={accounts} />
      </main>
    </div>
  );
}
