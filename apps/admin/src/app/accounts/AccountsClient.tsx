'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AccountBalance,
  AdminUserItem,
  formatCentavosToPHP,
  phpToCentavos,
  generateIdempotencyKey,
  AccountStatus,
  LedgerDirection,
} from '@davao-bank/shared';
import { setAccountStatusAction, adjustBalanceAction } from '../actions';
import {
  Table,
  Button,
  StatusBadge,
  Drawer,
  ConfirmDialog,
  Card,
  Input,
  Select,
  FilterBar,
} from '@/components/ui';
import styles from './Accounts.module.css';

interface AccountsClientProps {
  initialAccounts: AccountBalance[];
  allUsers: AdminUserItem[];
}

export function AccountsClient({ initialAccounts, allUsers }: AccountsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'savings' | 'checking'>('all');

  // Modal / Drawer state
  const [selectedDetailAccount, setSelectedDetailAccount] =
    useState<AccountBalance | null>(null);
  const [statusModalAccount, setStatusModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [targetStatus, setTargetStatus] = useState<AccountStatus>('frozen');

  // Adjustment Modal
  const [adjustModalAccount, setAdjustModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [adjustDirection, setAdjustDirection] = useState<LedgerDirection>('credit');
  const [adjustAmountStr, setAdjustAmountStr] = useState('');
  const [adjustIdempotencyKey, setAdjustIdempotencyKey] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // User Map for fast lookup
  const userMap: Record<string, AdminUserItem> = {};
  allUsers.forEach((u) => {
    userMap[u.id] = u;
  });

  // Filter accounts
  const filteredAccounts = initialAccounts.filter((a) => {
    const term = searchTerm.toLowerCase();
    const owner = userMap[a.user_id];
    const matchSearch =
      a.account_number.toLowerCase().includes(term) ||
      a.account_id.toLowerCase().includes(term) ||
      owner?.full_name?.toLowerCase().includes(term) ||
      owner?.email.toLowerCase().includes(term);

    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchType = typeFilter === 'all' || a.type === typeFilter;

    return matchSearch && matchStatus && matchType;
  });

  // Status Change
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

  // Balance Adjustment
  const openAdjustModal = (a: AccountBalance) => {
    setAdjustModalAccount(a);
    setAdjustDirection('credit');
    setAdjustAmountStr('');
    setAdjustIdempotencyKey(generateIdempotencyKey('admin_adj'));
  };

  const closeAdjustModal = () => {
    setAdjustModalAccount(null);
    setAdjustAmountStr('');
    setAdjustIdempotencyKey('');
  };

  const adjustmentCentavos = phpToCentavos(adjustAmountStr);
  const projectedBalance = adjustModalAccount
    ? adjustDirection === 'credit'
      ? adjustModalAccount.balance + adjustmentCentavos
      : adjustModalAccount.balance - adjustmentCentavos
    : 0;

  const handleExecuteAdjustment = async (reason: string) => {
    if (!adjustModalAccount || adjustmentCentavos <= 0) return;
    setIsAdjusting(true);

    const res = await adjustBalanceAction(
      adjustModalAccount.account_id,
      adjustmentCentavos,
      adjustDirection,
      reason,
      adjustIdempotencyKey
    );

    setIsAdjusting(false);

    if (res.success) {
      closeAdjustModal();
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
          <div className={`${styles.accountNum} tabular-nums`}>{a.account_number}</div>
          <div className={styles.accountMeta}>
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
            <div className={styles.ownerName}>
              {owner?.full_name || 'System / Unnamed'}
            </div>
            <div className={styles.ownerEmail}>
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
        <div className={styles.balanceCell}>
          <div className={`${styles.balanceAmount} tabular-nums`}>
            {formatCentavosToPHP(a.balance)}
          </div>
          <div className={styles.balanceMeta}>{a.ledger_entry_count} entries</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (a: AccountBalance) => (
        <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
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
              variant="secondary"
              onClick={() => {
                setStatusModalAccount(a);
                setTargetStatus('active');
              }}
            >
              Unfreeze
            </Button>
          ) : null}

          {a.status !== 'closed' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStatusModalAccount(a);
                setTargetStatus('closed');
              }}
            >
              Close
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <div className={styles.filterSearch}>
          <Input
            placeholder="Search by account number, UUID, or owner name/email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filterSelect}>
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

        <div className={styles.filterSelect}>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'savings', label: 'Savings Only' },
              { value: 'checking', label: 'Checking Only' },
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

      {/* Account Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedDetailAccount)}
        onClose={() => setSelectedDetailAccount(null)}
        title={`Account ${selectedDetailAccount?.account_number || ''}`}
      >
        {selectedDetailAccount && (
          <div className={styles.drawerStack}>
            <Card variant="subtle">
              <div className={styles.metaStack}>
                <div>
                  <div className={styles.metaLabel}>Available Balance</div>
                  <div className={`${styles.balanceLarge} tabular-nums`}>
                    {formatCentavosToPHP(selectedDetailAccount.balance)}
                  </div>
                </div>

                <div>
                  <div className={styles.metaLabel}>Status</div>
                  <div className={styles.statusWrapper}>
                    <StatusBadge status={selectedDetailAccount.status} />
                  </div>
                </div>

                <div>
                  <div className={styles.metaLabel}>Account ID</div>
                  <div className={styles.metaMono}>
                    {selectedDetailAccount.account_id}
                  </div>
                </div>

                <div>
                  <div className={styles.metaLabel}>Owner</div>
                  <div className={styles.metaText}>
                    {userMap[selectedDetailAccount.user_id]?.full_name ||
                      'System / Unnamed'}
                  </div>
                  <div className={styles.ownerEmail}>
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
          <div className={styles.modalStack}>
            <Card variant="subtle">
              <div className={styles.modalCardRow}>
                <div>
                  <div className={styles.modalSubtext}>ACCOUNT</div>
                  <div className={`${styles.boldNum} tabular-nums`}>
                    {adjustModalAccount.account_number}
                  </div>
                </div>
                <div className={styles.modalRightCol}>
                  <div className={styles.modalSubtext}>CURRENT BALANCE</div>
                  <div className={`${styles.boldNum} tabular-nums`}>
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
              <div className={styles.ledgerEffectBox}>
                <div className={styles.ledgerEffectLabel}>EXACT LEDGER EFFECT</div>
                <div className={`${styles.previewAmount} tabular-nums`}>
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
                const reasonPrompt = window.prompt(
                  'Enter mandatory reason for balance adjustment:'
                );
                if (reasonPrompt && reasonPrompt.trim().length > 0) {
                  handleExecuteAdjustment(reasonPrompt.trim()).catch((err) => {
                    alert(`Adjustment failed: ${err.message}`);
                  });
                } else if (reasonPrompt !== null) {
                  alert('Adjustment cancelled: reason is required.');
                }
              }}
              variant="primary"
              disabled={adjustmentCentavos <= 0 || isAdjusting}
              loading={isAdjusting}
              fullWidth
            >
              Execute Adjustment
            </Button>
          </div>
        </Drawer>
      )}
    </>
  );
}
