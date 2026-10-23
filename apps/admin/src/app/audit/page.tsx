import React from 'react';
import { type AuditLog } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
import { AuditClient } from './AuditClient';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
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

  // Query audit logs ordered newest first
  const { data: logsData } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const logs: AuditLog[] = logsData || [];

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Audit Trail & System Compliance"
        subtitle="Immutable append-only record of all administrative actions, money movements, and user changes."
      />
      <AuditClient initialLogs={logs} />
    </AdminShell>
  );
}
