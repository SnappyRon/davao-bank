import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatReferenceId } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import {
  caseIdFromSlug,
  eventAccountId,
  type CaseAccount,
  type CaseCustomer,
  type SecurityCaseDetail,
} from '@/lib/securityCases';
import { CaseDetailClient } from './CaseDetailClient';

export const dynamic = 'force-dynamic';

export default async function AdminCaseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caseId = caseIdFromSlug(slug);
  if (!caseId) notFound();

  const supabase = await createAdminCookieServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id || '')
    .maybeSingle();

  const { data: detailData, error: detailError } = await supabase.rpc(
    'admin_get_security_case',
    { p_id: caseId }
  );
  const detail = detailData as SecurityCaseDetail | null;

  const shell = (children: React.ReactNode, title: string) => (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader title={title} subtitle="Bantay security case review">
        <Link href="/cases">
          <Button variant="secondary">Back to cases</Button>
        </Link>
      </PageHeader>
      {children}
    </AdminShell>
  );

  if (detailError || !detail?.case?.id) {
    return shell(
      <Card>
        <EmptyState
          title="Case unavailable"
          description="This case could not be loaded. Security cases appear once the Bantay migration is deployed."
        />
      </Card>,
      'Security case'
    );
  }

  const [{ data: usersData }, { data: accountsData }] = await Promise.all([
    supabase.rpc('admin_get_users'),
    supabase
      .from('account_balances')
      .select('account_id, user_id, account_number, status'),
  ]);

  const users = (usersData || []) as CaseCustomer[];
  const accounts = (accountsData || []) as CaseAccount[];
  const customer = users.find((item) => item.id === detail.case.user_id) || null;
  const receivingId = eventAccountId(detail.events);
  const receivingAccount =
    accounts.find((account) => account.account_id === receivingId) || null;

  return shell(
    <CaseDetailClient
      detail={detail}
      customer={customer}
      receivingAccount={receivingAccount}
    />,
    `Security case ${formatReferenceId(detail.case.id)}`
  );
}
