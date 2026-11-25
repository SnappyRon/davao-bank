import React from 'react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { Badge, PageHeader } from '@/components/ui';
import { SERVICE_SIMULATION_LABEL } from '@/lib/adminServices';
import { AppointmentsClient } from './AppointmentsClient';

export const dynamic = 'force-dynamic';

export default async function AdminAppointmentsPage() {
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
        title="Branch appointments"
        subtitle="Review simulated branch visits. Customer names stay masked."
      >
        <Badge label={SERVICE_SIMULATION_LABEL} variant="info" />
      </PageHeader>
      <AppointmentsClient />
    </AdminShell>
  );
}
