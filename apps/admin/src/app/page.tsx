import React from 'react';
import Link from 'next/link';
import {
  Wallet,
  Users,
  CreditCard,
  TrendingUp,
  RotateCcw,
  ArrowRight,
  Download,
  Sliders,
} from 'lucide-react';
import { formatCentavosToPHP, type AdminDashboardStats } from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminShell } from '@/components/AdminShell';
import { PageHeader, StatTile, Card, Table, StatusBadge, Button } from '@/components/ui';
import styles from './Dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const supabase = await createAdminCookieServerClient();

  // 1. Fetch Admin Profile
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user?.id || '')
    .maybeSingle();

  // 2. Fetch Authoritative KPIs
  const { data: statsData } = await supabase.rpc('admin_get_dashboard_stats');
  const stats: AdminDashboardStats = statsData || {
    total_users: 0,
    active_users: 0,
    suspended_users: 0,
    total_accounts: 0,
    active_accounts: 0,
    frozen_accounts: 0,
    total_system_balance: 0,
    total_transactions: 0,
    completed_transactions: 0,
    reversed_transactions: 0,
    total_volume: 0,
    recent_30d_transactions: 0,
  };

  // 3. Fetch Recent Transactions
  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('id, type, status, reference, created_at, initiated_by')
    .order('created_at', { ascending: false })
    .limit(6);

  // 4. Fetch Recent Audit Logs
  const { data: recentAudits } = await supabase
    .from('audit_logs')
    .select('id, actor_role, action, entity, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const txList = recentTransactions || [];
  const auditList = recentAudits || [];

  const txColumns = [
    {
      key: 'type',
      header: 'Type',
      render: (t: any) => (
        <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{t.type}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t: any) => <StatusBadge status={t.status} />,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (t: any) => <span>{t.reference || '—'}</span>,
    },
    {
      key: 'created_at',
      header: 'Date / Time',
      align: 'right' as const,
      render: (t: any) => (
        <span className="tabular-nums">
          {new Date(t.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  return (
    <AdminShell adminEmail={user?.email} adminName={profile?.full_name}>
      <PageHeader
        title="Staff Console Dashboard"
        subtitle="Real-time oversight of customer accounts, double-entry financial ledger, and administrative operations."
      >
        <a href="/api/export/transactions">
          <Button variant="secondary" icon={<Download size={16} />}>
            Export CSV
          </Button>
        </a>
        <Link href="/accounts">
          <Button variant="primary" icon={<Sliders size={16} />}>
            Balance Adjustments
          </Button>
        </Link>
      </PageHeader>

      {/* KPI Stats Grid */}
      <div className={styles.statsGrid}>
        <StatTile
          label="Total System Balance"
          value={formatCentavosToPHP(stats.total_system_balance)}
          subtext="Includes biller settlement accounts"
          icon={<Wallet size={20} />}
          iconColor="green"
        />

        <StatTile
          label="Customers"
          value={stats.total_users}
          subtext={`${stats.active_users} active · ${stats.suspended_users} suspended`}
          icon={<Users size={20} />}
          iconColor="blue"
        />

        <StatTile
          label="Deposit Accounts"
          value={stats.total_accounts}
          subtext={`${stats.active_accounts} active · ${stats.frozen_accounts} frozen`}
          icon={<CreditCard size={20} />}
          iconColor="orange"
        />

        <StatTile
          label="30-Day Volume"
          value={formatCentavosToPHP(stats.total_volume)}
          subtext={`${stats.recent_30d_transactions} total transactions`}
          icon={<TrendingUp size={20} />}
          iconColor="yellow"
        />

        <StatTile
          label="Compensating Reversals"
          value={stats.reversed_transactions}
          subtext="Audited balance adjustments"
          icon={<RotateCcw size={20} />}
          iconColor="red"
        />
      </div>

      {/* 2-Column Content Grid */}
      <div className={styles.contentGrid}>
        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Ledger Transactions</h2>
            <Link href="/transactions" className={styles.viewAllLink}>
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <Table columns={txColumns} data={txList} keyExtractor={(t: any) => t.id} />
        </div>

        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Audit Activity</h2>
            <Link href="/audit" className={styles.viewAllLink}>
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <Card>
            <div className={styles.auditList}>
              {auditList.map((item: any) => (
                <div key={item.id} className={styles.auditItem}>
                  <div className={styles.auditTopRow}>
                    <span className={styles.auditAction}>{item.action}</span>
                    <span className={styles.auditTime}>
                      {new Date(item.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className={styles.auditEntity}>
                    Role: {item.actor_role || 'system'} · Entity:{' '}
                    {item.entity || 'general'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
