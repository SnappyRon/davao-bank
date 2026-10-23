'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  type AccountBalance,
  type AccountStatus,
  type AccountType,
  type LedgerDirection,
  type AdminUserItem,
} from '@davao-bank/shared';
import {
  setAccountStatusAction,
  adjustBalanceAction,
  openAccountAction,
} from '../actions';
import {
  Table,
  FilterBar,
  Input,
  Select,
  StatusBadge,
  Badge,
  Button,
  Drawer,
  ConfirmDialog,
  Card,
} from '@/components/ui';

interface AccountsClientProps {
  initialAccounts: AccountBalance[];
  allUsers: AdminUserItem[];
}

export function AccountsClient({ initialAccounts, allUsers }: AccountsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'frozen' | 'closed'
  >('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'savings' | 'checking'>('all');

  // Status Change State
  const [statusModalAccount, setStatusModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [targetStatus, setTargetStatus] = useState<AccountStatus>('frozen');

  // Balance Adjustment State
  const [adjustModalAccount, setAdjustModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [adjustDirection, setAdjustDirection] = useState<LedgerDirection>('credit');
  const [adjustAmountStr, setAdjustAmountStr] = useState('');
  const [adjustIdempotencyKey, setAdjustIdempotencyKey] = useState('');

  // Selected Detail Drawer
  const [selectedDetailAccount, setSelectedDetailAccount] =
    useState<AccountBalance | null>(null);

  const userMap: Record<string, AdminUserItem> = {};
  allUsers.forEach((u) => {
    userMap[u.id] = u;
  });

  const filteredAccounts = initialAccounts.filter((acc) => {
    const owner = userMap[acc.user_id];
    const ownerName = owner?.full_name || owner?.email || '';

    const matchesSearch =
      acc.account_number.includes(searchTerm) ||
      ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.account_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
    const matchesType = typeFilter === 'all' || acc.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const handleConfirmStatusChange = async (reason: string) => {
    if (!statusModalAccount) return;
    const res = await setAccountStatusAction(
      statusModalAccount.account_id,
      targetStatus,
      reason
    );

    if (res.success) {
      setStatusModalAccount(null);
      router.refresh();
    } else {
      throw new Error(res.error || 'Failed to update account status');
    }
  };

  const openAdjustModal = (acc: AccountBalance) => {
    setAdjustModalAccount(acc);
    setAdjustDirection('credit');
    setAdjustAmountStr('');
    setAdjustIdempotencyKey(generateIdempotencyKey('admin_adj'));
  };

  const closeAdjustModal = () => {
    setAdjustModalAccount(null);
    setAdjustIdempotencyKey('');
  };

  const handleConfirmAdjustment = async (reason: string) => {
    if (!adjustModalAccount) return;
    const centavos = phpToCentavos(adjustAmountStr);
    if (centavos <= 0) {
      throw new Error('Adjustment amount must be greater than ₱0.00');
    }

    const res = await adjustBalanceAction(
      adjustModalAccount.account_id,
      centavos,
      adjustDirection,
      reason,
      adjustIdempotencyKey
    );

    if (res.success) {
      setAdjustModalAccount(null);
      router.refresh();
    } else {
      throw new Error(res.error || 'Balance adjustment failed');
    }
  };

  const columns = [
    {
      key: 'account_number',
      header: 'Account Number',
      render: (a: AccountBalance) => (
        <div>
          <div style={{ fontWeight: 700 }} className="tabular-nums">
            {a.account_number}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              textTransform: 'capitalize',
            }}
          >
            {a.type} · {a.currency}
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Customer Owner',
      render: (a: AccountBalance) => {
        const owner = userMap[a.user_id];
        return (
          <div>
            <div style={{ fontWeight: 600 }}>
              {owner?.full_name || 'System / Unnamed'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {owner?.email || a.user_id.substring(0, 8)}
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (a: AccountBalance) => <StatusBadge status={a.status} />,
    },
    {
      key: 'balance',
      header: 'Authoritative Balance',
      align: 'right' as const,
      render: (a: AccountBalance) => (
        <div style={{ textAlign: 'right' }}>
          <div
            style={{ fontWeight: 800, color: 'var(--color-primary)' }}
            className="tabular-nums"
          >
            {formatCentavosToPHP(a.balance)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {a.ledger_entry_count} entries
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (a: AccountBalance) => (
        <div
          style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="secondary" onClick={() => openAdjustModal(a)}>
            Adjust Balance
          </Button>

          {a.status === 'active' ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setStatusModalAccount(a);
                setTargetStatus('frozen');
              }}
            >
              Freeze
            </Button>
          ) : a.status === 'frozen' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setStatusModalAccount(a);
                setTargetStatus('active');
              }}
            >
              Unfreeze
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const adjustmentCentavos = phpToCentavos(adjustAmountStr);
  const projectedBalance = adjustModalAccount
    ? adjustDirection === 'credit'
      ? adjustModalAccount.balance + adjustmentCentavos
      : adjustModalAccount.balance - adjustmentCentavos
    : 0;

  return (
    <>
      <FilterBar>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Input
            placeholder="Search by account number, owner name, or UUID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ width: 160 }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active Only' },
              { value: 'frozen', label: 'Frozen Only' },
              { value: 'closed', label: 'Closed Only' },
            ]}
          />
        </div>

        <div style={{ width: 160 }}>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'savings', label: 'Savings' },
              { value: 'checking', label: 'Checking' },
            ]}
          />
        </div>
      </FilterBar>

      <Table
        columns={columns}
        data={filteredAccounts}
        keyExtractor={(a) => a.account_id}
        onRowClick={(a) => setSelectedDetailAccount(a)}
      />

      {/* Account Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedDetailAccount)}
        onClose={() => setSelectedDetailAccount(null)}
        title={`Account ${selectedDetailAccount?.account_number || ''}`}
      >
        {selectedDetailAccount && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}
          >
            <Card variant="subtle">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Available Balance
                  </div>
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                    }}
                    className="tabular-nums"
                  >
                    {formatCentavosToPHP(selectedDetailAccount.balance)}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Status
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={selectedDetailAccount.status} />
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Account ID
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                    {selectedDetailAccount.account_id}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Owner
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {userMap[selectedDetailAccount.user_id]?.full_name ||
                      'System / Unnamed'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {userMap[selectedDetailAccount.user_id]?.email || ''}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      {/* Status Change Dialog */}
      {statusModalAccount && (
        <ConfirmDialog
          isOpen={Boolean(statusModalAccount)}
          onClose={() => setStatusModalAccount(null)}
          onConfirm={handleConfirmStatusChange}
          title={`${targetStatus === 'frozen' ? 'Freeze' : 'Unfreeze'} Account`}
          description={`Are you sure you want to mark account ${statusModalAccount.account_number} as ${targetStatus}?`}
          ledgerEffect={
            targetStatus === 'frozen'
              ? 'Blocks all debits and transfers out of this account until unfrozen by staff.'
              : 'Restores full debit and transaction privileges for the account holder.'
          }
          variant={targetStatus === 'frozen' ? 'destructive' : 'info'}
          confirmText={`${targetStatus === 'frozen' ? 'Freeze' : 'Unfreeze'} Account`}
        />
      )}

      {/* Balance Adjustment Dialog */}
      {adjustModalAccount && (
        <Drawer
          isOpen={Boolean(adjustModalAccount)}
          onClose={closeAdjustModal}
          title="Adjust Account Balance"
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)' }}
          >
            <Card variant="subtle">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    ACCOUNT
                  </div>
                  <div style={{ fontWeight: 700 }} className="tabular-nums">
                    {adjustModalAccount.account_number}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    CURRENT BALANCE
                  </div>
                  <div style={{ fontWeight: 700 }} className="tabular-nums">
                    {formatCentavosToPHP(adjustModalAccount.balance)}
                  </div>
                </div>
              </div>
            </Card>

            <Select
              label="Adjustment Direction"
              value={adjustDirection}
              onChange={(e) => setAdjustDirection(e.target.value as LedgerDirection)}
              options={[
                { value: 'credit', label: 'Credit (Increase Balance)' },
                { value: 'debit', label: 'Debit (Decrease Balance)' },
              ]}
            />

            <Input
              label="Amount in PHP"
              placeholder="e.g. 500.00"
              value={adjustAmountStr}
              onChange={(e) => setAdjustAmountStr(e.target.value)}
            />

            {adjustmentCentavos > 0 && (
              <div
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '4px solid var(--color-primary)',
                  fontSize: '0.875rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  EXACT LEDGER EFFECT
                </div>
                <div style={{ fontWeight: 700, marginTop: 4 }} className="tabular-nums">
                  {adjustDirection.toUpperCase()}{' '}
                  {formatCentavosToPHP(adjustmentCentavos)} on{' '}
                  {adjustModalAccount.account_number} → New balance:{' '}
                  {formatCentavosToPHP(projectedBalance)}
                </div>
              </div>
            )}

            <Button
              onClick={() => {
                if (adjustmentCentavos <= 0) return;
                // Open confirmation prompt
                const effect = `${adjustDirection.toUpperCase()} ${formatCentavosToPHP(adjustmentCentavos)} on ${adjustModalAccount.account_number} → New balance: ${formatCentavosToPHP(projectedBalance)}`;
                const proceed = window.confirm(`Confirm Ledger Adjustment?\n\n${effect}`);
                if (proceed) {
                  const reasonPrompt = window.prompt(
                    'Enter mandatory reason for balance adjustment:'
                  );
                  if (reasonPrompt && reasonPrompt.trim()) {
                    handleConfirmAdjustment(reasonPrompt.trim()).catch((err) =>
                      alert(err.message)
                    );
                  }
                }
              }}
              disabled={adjustmentCentavos <= 0}
              variant="primary"
              fullWidth
            >
              Apply Adjustment
            </Button>
          </div>
        </Drawer>
      )}
    </>
  );
}
