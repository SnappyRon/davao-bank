import React from 'react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { Badge, PageHeader } from '@/components/ui';
import { SERVICE_SIMULATION_LABEL } from '@/lib/adminServices';
import { ServiceRequestsClient } from './ServiceRequestsClient';

export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string | string[];
}

export default async function AdminServiceRequestsPage({
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
  const { status } = await searchParams;

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Service requests"
        subtitle="Review simulated document and account requests. Customer details stay masked."
      >
        <Badge label={SERVICE_SIMULATION_LABEL} variant="info" />
      </PageHeader>
      <ServiceRequestsClient initialStatus={typeof status === 'string' ? status : null} />
    </AdminShell>
  );
}
