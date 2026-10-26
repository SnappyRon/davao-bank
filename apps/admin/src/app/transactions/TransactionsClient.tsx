'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, RotateCcw } from 'lucide-react';
import {
  formatCentavosToPHP,
  generateIdempotencyKey,
  type TransactionType,
  type TransactionStatus,
} from '@davao-bank/shared';
import { reverseTransactionAction } from '../actions';
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
  EmptyState,
} from '@/components/ui';

export interface AdminTransactionRow {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  initiated_by: string | null;
  idempotency_key: string | null;
  reference: string | null;
  created_at: string;
  amount: number;
  accounts_involved: string[];
}

export interface AdminPaymentRequestRow {
  id: string;
  requester_id: string;
  requester_account: string;
  requester_account_number: string;
  payer_account_number: string;
  payer_user_id: string;
  amount: number;
  note: string | null;
  status: 'pending' | 'paid' | 'declined' | 'cancelled' | 'expired';
  transaction_id: string | null;
  expires_at: string;
  created_at: string;
  responded_at: string | null;
}

interface TransactionsClientProps {
  initialTransactions: AdminTransactionRow[];
  initialRequests?: AdminPaymentRequestRow[];
}

export function TransactionsClient({
  initialTransactions,
  initialRequests = [],
}: TransactionsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'transactions' | 'requests'>('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all');
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');

  // Reversal Modal State
  const [reversalTx, setReversalTx] = useState<AdminTransactionRow | null>(null);
  const [reversalIdempotencyKey, setReversalIdempotencyKey] = useState<string>('');

  // Detail Drawer State
  const [selectedTxDetail, setSelectedTxDetail] = useState<AdminTransactionRow | null>(
    null
  );

  const openReversalModal = (tx: AdminTransactionRow) => {
    setReversalTx(tx);
    setReversalIdempotencyKey(generateIdempotencyKey('admin_rev'));
  };

  const closeReversalModal = () => {
    setReversalTx(null);
    setReversalIdempotencyKey('');
  };

  const handleConfirmReversal = async (reason: string) => {
    if (!reversalTx) return;

    const res = await reverseTransactionAction(
      reversalTx.id,
      reason,
      reversalIdempotencyKey
    );

    if (res.success) {
      setReversalTx(null);
      router.refresh();
    } else {
      throw new Error(res.error || 'Failed to reverse transaction');
    }
  };

  const filteredTransactions = initialTransactions.filter((tx) => {
    const matchesSearch =
      tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.idempotency_key || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.accounts_involved.some((acc) => acc.includes(searchTerm));

    const matchesType = typeFilter === 'all' || tx.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (tx: AdminTransactionRow) => (
        <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{tx.type}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (tx: AdminTransactionRow) => <StatusBadge status={tx.status} />,
    },
    {
      key: 'accounts',
      header: 'Accounts Involved',
      render: (tx: AdminTransactionRow) => (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
          {tx.accounts_involved.length > 0 ? tx.accounts_involved.join(' ↔ ') : '—'}
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (tx: AdminTransactionRow) => (
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {tx.reference || '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (tx: AdminTransactionRow) => (
        <span style={{ fontWeight: 800 }} className="tabular-nums">
          {formatCentavosToPHP(tx.amount)}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Timestamp',
      align: 'right' as const,
      render: (tx: AdminTransactionRow) => (
        <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {new Date(tx.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (tx: AdminTransactionRow) => (
        <div
          style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedTxDetail(tx)}
            title="View Details"
          >
            <Eye size={16} />
          </Button>

          {tx.status === 'completed' && tx.type === 'transfer' ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openReversalModal(tx)}
              icon={<RotateCcw size={14} />}
            >
              Reverse
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const requestColumns = [
    {
      key: 'id',
      header: 'Request ID',
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
          {r.id.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: 'requester',
      header: 'Requester Account',
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {r.requester_account_number}
        </span>
      ),
    },
    {
      key: 'payer',
      header: 'Payer Account',
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ fontFamily: 'monospace' }}>
          {r.payer_account_number}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ fontWeight: 700 }} className="tabular-nums">
          {formatCentavosToPHP(r.amount)}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          {r.note || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: AdminPaymentRequestRow) => {
        if (r.status === 'paid') return <Badge label="Paid" variant="success" />;
        if (r.status === 'pending') return <Badge label="Pending" variant="warning" />;
        if (r.status === 'declined') return <Badge label="Declined" variant="danger" />;
        return <Badge label={r.status} variant="neutral" />;
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (r: AdminPaymentRequestRow) => (
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const filteredRequests = initialRequests.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      r.id.toLowerCase().includes(term) ||
      r.requester_account_number.toLowerCase().includes(term) ||
      r.payer_account_number.toLowerCase().includes(term) ||
      (r.note && r.note.toLowerCase().includes(term));
    const matchesStatus =
      requestStatusFilter === 'all' || r.status === requestStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      {/* Tab Switcher: Transactions vs Payment Requests */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Button
          variant={activeTab === 'transactions' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('transactions')}
        >
          Completed Ledger Activity ({initialTransactions.length})
        </Button>
        <Button
          variant={activeTab === 'requests' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveTab('requests')}
        >
          Payment Requests ({initialRequests.length})
        </Button>
      </div>

      {activeTab === 'transactions' ? (
        <>
          <FilterBar>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Input
                placeholder="Search by transaction ID, reference, or account..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ width: 160 }}>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'transfer', label: 'Transfers' },
                  { value: 'deposit', label: 'Cash-in (Deposit)' },
                  { value: 'withdrawal', label: 'Cash-out (Withdraw)' },
                  { value: 'adjustment', label: 'Adjustments' },
                  { value: 'reversal', label: 'Reversals' },
                ]}
              />
            </div>

            <div style={{ width: 160 }}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'reversed', label: 'Reversed' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'failed', label: 'Failed' },
                ]}
              />
            </div>
          </FilterBar>

          <Table
            columns={columns}
            data={filteredTransactions}
            keyExtractor={(tx) => tx.id}
            onRowClick={(tx) => setSelectedTxDetail(tx)}
          />
        </>
      ) : (
        <>
          <FilterBar>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Input
                placeholder="Search by request ID, account, note..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ width: 160 }}>
              <Select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'declined', label: 'Declined' },
                  { value: 'cancelled', label: 'Cancelled' },
                  { value: 'expired', label: 'Expired' },
                ]}
              />
            </div>
          </FilterBar>

          <Table
            columns={requestColumns}
            data={filteredRequests}
            keyExtractor={(r) => r.id}
            emptyState={
              <EmptyState
                title="No payment requests found"
                description="No payment requests matching current search or status filters."
              />
            }
          />
        </>
      )}

      {/* Transaction Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedTxDetail)}
        onClose={() => setSelectedTxDetail(null)}
        title="Transaction Ledger Envelope"
      >
        {selectedTxDetail && (
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
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    AMOUNT
                  </div>
                  <div
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                    }}
                    className="tabular-nums"
                  >
                    {formatCentavosToPHP(selectedTxDetail.amount)}
                  </div>
                </div>

                <div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    STATUS
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={selectedTxDetail.status} />
                  </div>
                </div>

                <div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    TRANSACTION UUID
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                    {selectedTxDetail.id}
                  </div>
                </div>

                {selectedTxDetail.idempotency_key ? (
                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      IDEMPOTENCY KEY
                    </div>
                    <div
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                    >
                      {selectedTxDetail.idempotency_key}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    ACCOUNTS INVOLVED
                  </div>
                  <div style={{ fontWeight: 600 }} className="tabular-nums">
                    {selectedTxDetail.accounts_involved.join(', ')}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      {/* Confirm Reversal Dialog */}
      {reversalTx && (
        <ConfirmDialog
          isOpen={Boolean(reversalTx)}
          onClose={closeReversalModal}
          onConfirm={handleConfirmReversal}
          title="Reverse Financial Transaction"
          description={`Are you sure you want to reverse transfer ${reversalTx.id}?`}
          ledgerEffect={`Generates atomic balanced compensating entries for ${formatCentavosToPHP(reversalTx.amount)}, restoring original balances.`}
          variant="destructive"
          confirmText="Execute Reversal"
        />
      )}
    </>
  );
}
