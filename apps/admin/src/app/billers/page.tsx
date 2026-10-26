import React from 'react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
import { BillersClient, type AdminBillerRow } from './BillersClient';

export const dynamic = 'force-dynamic';

export default async function AdminBillersPage() {
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

  // Fetch all billers
  const { data: billersData } = await supabase
    .from('billers')
    .select('*')
    .order('name', { ascending: true });

  // Fetch accounts to display settlement account numbers
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, account_number, status');
  const accountMap: Record<string, { account_number: string; status: string }> = {};
  (accountsData || []).forEach((a) => {
    accountMap[a.id] = { account_number: a.account_number, status: a.status };
  });

  const billers: AdminBillerRow[] = (billersData || []).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    account_id: b.account_id,
    account_number: accountMap[b.account_id]?.account_number || 'Pending Account',
    account_status: accountMap[b.account_id]?.status || 'active',
    reference_label: b.reference_label,
    reference_pattern: b.reference_pattern,
    is_active: b.is_active,
    created_at: b.created_at,
  }));

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Biller Directory & Settlement"
        subtitle="Manage simulated utility billers, validation patterns, and system settlement accounts."
      />
      <BillersClient initialBillers={billers} />
    </AdminShell>
  );
}
