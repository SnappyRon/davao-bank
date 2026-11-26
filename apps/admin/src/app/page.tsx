import React from 'react';
import Link from 'next/link';
import { Download, Sliders, ShieldAlert } from 'lucide-react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader, Button } from '@/components/ui';
import { OperationsDashboard } from '@/components/operations/OperationsDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const supabase = await createAdminCookieServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id || '')
    .maybeSingle();

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Staff console dashboard"
        subtitle="Live operations across accounts, transactions, security, and staff activity."
      >
        <a href="/api/export/transactions">
          <Button variant="secondary" icon={<Download size={16} />}>
            Export CSV
          </Button>
        </a>
        <Link href="/accounts">
          <Button variant="primary" icon={<Sliders size={16} />}>
            Balance adjustments
          </Button>
        </Link>
        <Link href="/cases">
          <Button variant="secondary" icon={<ShieldAlert size={16} />}>
            Security cases
          </Button>
        </Link>
      </PageHeader>
      <OperationsDashboard />
    </AdminShell>
  );
}
