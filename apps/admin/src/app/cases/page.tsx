import React from 'react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
import { isCaseStatus, type SecurityCaseListItem } from '@/lib/securityCases';
import { CasesClient } from './CasesClient';

export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string | string[];
}

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createAdminCookieServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id || '')
    .maybeSingle();

  const { status: rawStatus } = await searchParams;
  const status = isCaseStatus(rawStatus) ? rawStatus : null;
  const { data, error } = await supabase.rpc('admin_list_security_cases', {
    p_status: status,
  });

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Security cases"
        subtitle="Review Bantay alerts, verify the customer, and resolve flagged activity."
      />
      <CasesClient
        initialCases={(data || []) as SecurityCaseListItem[]}
        status={status || 'all'}
        loadError={error ? 'Security cases are not available yet.' : null}
      />
    </AdminShell>
  );
}
