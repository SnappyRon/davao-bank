import React from 'react';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader } from '@/components/ui';
import {
  SchedulesClient,
  type AdminScheduleRow,
} from './SchedulesClient';

export const dynamic = 'force-dynamic';

export default async function AdminSchedulesPage() {
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

  // 1. Fetch all scheduled payments
  const { data: schedulesData } = await supabase
    .from('scheduled_payments')
    .select('*')
    .order('created_at', { ascending: false });

  // 2. Fetch profiles to map owner names
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, phone');
  const profileMap: Record<string, { full_name: string | null; phone: string | null }> = {};
  (profilesData || []).forEach((p) => {
    profileMap[p.id] = { full_name: p.full_name, phone: p.phone };
  });

  // 3. Fetch accounts to map account numbers
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, account_number');
  const accountMap: Record<string, string> = {};
  (accountsData || []).forEach((a) => {
    accountMap[a.id] = a.account_number;
  });

  // 4. Fetch billers to map biller names
  const { data: billersData } = await supabase
    .from('billers')
    .select('id, name, category');
  const billerMap: Record<string, { name: string; category: string }> = {};
  (billersData || []).forEach((b) => {
    billerMap[b.id] = { name: b.name, category: b.category };
  });

  // 5. Fetch all runs
  const { data: runsData } = await supabase
    .from('scheduled_payment_runs')
    .select('*')
    .order('run_date', { ascending: false });
  const runsMap: Record<string, any[]> = {};
  (runsData || []).forEach((run) => {
    if (!runsMap[run.schedule_id]) {
      runsMap[run.schedule_id] = [];
    }
    runsMap[run.schedule_id].push(run);
  });

  const schedules: AdminScheduleRow[] = (schedulesData || []).map((s) => ({
    id: s.id,
    owner_id: s.owner_id,
    owner_name: profileMap[s.owner_id]?.full_name || 'Customer',
    owner_phone: profileMap[s.owner_id]?.phone || null,
    from_account: s.from_account,
    from_account_number: accountMap[s.from_account] || s.from_account,
    kind: s.kind,
    to_account: s.to_account,
    to_account_number: s.to_account ? accountMap[s.to_account] || s.to_account : null,
    biller_id: s.biller_id,
    biller_name: s.biller_id ? billerMap[s.biller_id]?.name || 'Unknown Biller' : null,
    biller_reference: s.biller_reference,
    amount: Number(s.amount),
    note: s.note,
    frequency: s.frequency,
    start_date: s.start_date,
    end_date: s.end_date,
    max_runs: s.max_runs,
    runs_done: s.runs_done,
    next_run_date: s.next_run_date,
    status: s.status,
    created_at: s.created_at,
    updated_at: s.updated_at,
    runs: runsMap[s.id] || [],
  }));

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Scheduled & Recurring Payments"
        subtitle="Oversight of automated transfer rules, utility bill schedules, and execution audit history."
      />
      <SchedulesClient initialSchedules={schedules} />
    </AdminShell>
  );
}
