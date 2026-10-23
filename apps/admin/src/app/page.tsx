import React from 'react';
import Link from 'next/link';
import {
  colors,
  formatCentavosToPHP,
  coreColorSwatches,
  type AdminDashboardStats,
} from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';
import { AdminNav } from '@/components/AdminNav';

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
          gap: '2rem',
        }}
      >
        {/* Welcome & Overview Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
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
              Core Banking Operations
            </div>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                color: colors.textPrimary,
                marginTop: '0.25rem',
              }}
            >
              Executive Management Dashboard
            </h1>
            <p
              style={{
                fontSize: '0.9rem',
                color: colors.textSecondary,
                marginTop: '0.25rem',
              }}
            >
              Real-time oversight of customer accounts, double-entry financial ledger, and
              administrative controls.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <a
              href="/api/export/transactions"
              style={{
                backgroundColor: colors.surface,
                color: colors.primary,
                border: `1px solid ${colors.border}`,
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              📥 Export Ledger CSV
            </a>
            <Link
              href="/accounts"
              style={{
                backgroundColor: colors.primary,
                color: colors.textInverse,
                padding: '0.6rem 1.1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              ⚖️ Balance Adjustments
            </Link>
          </div>
        </div>

        {/* Primary Financial Metric Hero */}
        <div
          style={{
            backgroundColor: colors.primary,
            borderRadius: '16px',
            padding: '2rem',
            color: colors.textInverse,
            boxShadow: '0 4px 12px rgba(106, 27, 122, 0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                opacity: 0.8,
                letterSpacing: '1px',
              }}
            >
              TOTAL SYSTEM LIQUIDITY &bull; ALL CUSTOMER ACCOUNTS
            </div>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 900,
                marginTop: '0.5rem',
                letterSpacing: '-0.5px',
              }}
            >
              {formatCentavosToPHP(stats.total_system_balance)}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.5rem' }}>
              Authoritative balance derived from balanced double-entry ledger entries
              across {stats.total_accounts} accounts.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
              paddingLeft: '1.5rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 700 }}>
                30-DAY VOLUME
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {formatCentavosToPHP(stats.total_volume)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 700 }}>
                COMPLETED TRANSACTIONS
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {stats.completed_transactions.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Core KPI Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Total Customers */}
          <Link
            href="/users"
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Customers &amp; Profiles
              </span>
              <span style={{ fontSize: '1.25rem' }}>👥</span>
            </div>
            <div
              style={{ fontSize: '1.75rem', fontWeight: 800, color: colors.textPrimary }}
            >
              {stats.total_users.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              <strong style={{ color: colors.success }}>
                {stats.active_users} active
              </strong>{' '}
              &bull;{' '}
              <strong style={{ color: colors.error }}>
                {stats.suspended_users} suspended
              </strong>
            </div>
          </Link>

          {/* Deposit Accounts */}
          <Link
            href="/accounts"
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Deposit Accounts
              </span>
              <span style={{ fontSize: '1.25rem' }}>🏦</span>
            </div>
            <div
              style={{ fontSize: '1.75rem', fontWeight: 800, color: colors.textPrimary }}
            >
              {stats.total_accounts.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              <strong style={{ color: colors.success }}>
                {stats.active_accounts} active
              </strong>{' '}
              &bull;{' '}
              <strong style={{ color: colors.warning }}>
                {stats.frozen_accounts} frozen
              </strong>
            </div>
          </Link>

          {/* Total Transactions */}
          <Link
            href="/transactions"
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                All Transactions
              </span>
              <span style={{ fontSize: '1.25rem' }}>💳</span>
            </div>
            <div
              style={{ fontSize: '1.75rem', fontWeight: 800, color: colors.textPrimary }}
            >
              {stats.total_transactions.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              <span>{stats.recent_30d_transactions} in last 30d</span> &bull;{' '}
              <strong style={{ color: colors.error }}>
                {stats.reversed_transactions} reversed
              </strong>
            </div>
          </Link>

          {/* Audit Logs */}
          <Link
            href="/audit"
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                System Audit Trail
              </span>
              <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            </div>
            <div
              style={{ fontSize: '1.75rem', fontWeight: 800, color: colors.textPrimary }}
            >
              Append-Only
            </div>
            <div style={{ fontSize: '0.8rem', color: colors.success, fontWeight: 600 }}>
              ✓ Immutable RLS Protected
            </div>
          </Link>
        </div>

        {/* Operational Overview: Recent Transactions & Audit Stream */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {/* Recent Transactions List */}
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{ fontSize: '1.1rem', fontWeight: 800, color: colors.textPrimary }}
              >
                Recent Transactions
              </h2>
              <Link
                href="/transactions"
                style={{ fontSize: '0.8rem', fontWeight: 700, color: colors.primary }}
              >
                View All &rarr;
              </Link>
            </div>

            {!recentTransactions || recentTransactions.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: colors.textMuted,
                  fontSize: '0.875rem',
                }}
              >
                No transaction records found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: colors.background,
                      border: `1px solid ${colors.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              tx.type === 'reversal'
                                ? colors.errorLight
                                : colors.surfaceSubtle,
                            color: tx.type === 'reversal' ? colors.error : colors.primary,
                            textTransform: 'uppercase',
                          }}
                        >
                          {tx.type}
                        </span>
                        <span
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: colors.textPrimary,
                          }}
                        >
                          {tx.reference || 'Standard Transaction'}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textMuted,
                          marginTop: '0.2rem',
                        }}
                      >
                        {new Date(tx.created_at).toLocaleString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor:
                            tx.status === 'completed'
                              ? colors.successLight
                              : colors.errorLight,
                          color:
                            tx.status === 'completed' ? colors.successDark : colors.error,
                        }}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Audit Log Preview */}
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{ fontSize: '1.1rem', fontWeight: 800, color: colors.textPrimary }}
              >
                Security Audit Activity
              </h2>
              <Link
                href="/audit"
                style={{ fontSize: '0.8rem', fontWeight: 700, color: colors.primary }}
              >
                Full Audit Trail &rarr;
              </Link>
            </div>

            {!recentAudits || recentAudits.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: colors.textMuted,
                  fontSize: '0.875rem',
                }}
              >
                No audit entries recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recentAudits.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: colors.background,
                      border: `1px solid ${colors.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: colors.textPrimary,
                        }}
                      >
                        {a.action}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textMuted,
                          marginTop: '0.2rem',
                        }}
                      >
                        Entity: {a.entity || 'system'} &bull; Role: {a.actor_role}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      {new Date(a.created_at).toLocaleTimeString('en-PH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cultural Brand Foundation Palette (Preserved from Phase 1) */}
        <div
          style={{
            backgroundColor: colors.surface,
            borderRadius: '12px',
            border: `1px solid ${colors.border}`,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: colors.primary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Cultural Identity Tokens (Proposal §5.3)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            {coreColorSwatches.map((item) => (
              <div
                key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: item.hex,
                    border: `1px solid ${colors.border}`,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    {item.culturalName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                    {item.hex}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
