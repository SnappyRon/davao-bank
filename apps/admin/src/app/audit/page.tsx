import React from 'react';
import { colors, type AuditLog } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminNav } from '@/components/AdminNav';
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
            Compliance &amp; Governance
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: colors.textPrimary,
              marginTop: '0.25rem',
            }}
          >
            System Audit Trail &amp; Attributability
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: colors.textSecondary,
              marginTop: '0.25rem',
            }}
          >
            Immutable, append-only record of all administrative actions, status
            transitions, balance adjustments, and reversals.
          </p>
        </div>

        <AuditClient initialLogs={logs} />
      </main>
    </div>
  );
}
