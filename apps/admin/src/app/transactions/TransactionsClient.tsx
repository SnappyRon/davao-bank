'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  colors,
  formatCentavosToPHP,
  generateIdempotencyKey,
  type TransactionType,
  type TransactionStatus,
} from '@davao-bank/shared';
import { reverseTransactionAction } from '../actions';

export interface AdminTransactionRow {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  initiated_by: string | null;
  idempotency_key: string | null;
  reference: string | null;
  created_at: string;
  amount: number; // centavos calculated from ledger entries
  accounts_involved: string[];
}

interface TransactionsClientProps {
  initialTransactions: AdminTransactionRow[];
}

export function TransactionsClient({ initialTransactions }: TransactionsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all');

  // Reversal Modal State
  const [reversalTx, setReversalTx] = useState<AdminTransactionRow | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalIdempotencyKey, setReversalIdempotencyKey] = useState<string>('');
  const [isReversing, setIsReversing] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const openReversalModal = (tx: AdminTransactionRow) => {
    setReversalTx(tx);
    setReversalReason('');
    setReversalError(null);
    setReversalIdempotencyKey(generateIdempotencyKey('admin_rev'));
  };

  const closeReversalModal = () => {
    if (isReversing) return;
    setReversalTx(null);
    setReversalReason('');
    setReversalError(null);
    setReversalIdempotencyKey('');
  };

  // Detail Modal State
  const [detailTx, setDetailTx] = useState<AdminTransactionRow | null>(null);

  // Filter transactions
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

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTx) return;

    if (!reversalReason.trim()) {
      setReversalError('Reason is mandatory for transaction reversal');
      return;
    }

    setIsReversing(true);
    setReversalError(null);

    // Reuse idempotency key across double-submits and retries
    const idempotencyKey = reversalIdempotencyKey || generateIdempotencyKey('admin_rev');
    if (!reversalIdempotencyKey) {
      setReversalIdempotencyKey(idempotencyKey);
    }

    const res = await reverseTransactionAction(
      reversalTx.id,
      reversalReason.trim(),
      idempotencyKey
    );
    setIsReversing(false);

    if (res.success) {
      setReversalTx(null);
      setReversalReason('');
      setReversalIdempotencyKey('');
      router.refresh();
    } else {
      setReversalError(res.error || 'Failed to reverse transaction');
    }
  };

  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case 'deposit':
        return { bg: colors.successLight, text: colors.successDark };
      case 'withdrawal':
        return { bg: colors.warningLight, text: colors.warning };
      case 'transfer':
        return { bg: colors.primaryLight, text: colors.primary };
      case 'adjustment':
        return { bg: colors.accentLight, text: colors.accentDark };
      case 'reversal':
        return { bg: colors.errorLight, text: colors.error };
      default:
        return { bg: colors.surfaceSubtle, text: colors.textSecondary };
    }
  };

  const getStatusColor = (status: TransactionStatus) => {
    switch (status) {
      case 'completed':
        return { bg: colors.successLight, text: colors.successDark };
      case 'reversed':
        return { bg: colors.errorLight, text: colors.error };
      case 'pending':
        return { bg: colors.warningLight, text: colors.warning };
      default:
        return { bg: colors.surfaceSubtle, text: colors.textMuted };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search & Actions Bar */}
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <input
            type="text"
            placeholder="Search by transaction ID, reference note, or account..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              fontSize: '0.875rem',
              outline: 'none',
              backgroundColor: colors.background,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Types</option>
            <option value="transfer">Transfers</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="adjustment">Adjustments</option>
            <option value="reversal">Reversals</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | TransactionStatus)}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="reversed">Reversed</option>
            <option value="pending">Pending</option>
          </select>

          {/* Export CSV */}
          <a
            href="/api/export/transactions"
            style={{
              backgroundColor: colors.surface,
              color: colors.primary,
              border: `1px solid ${colors.border}`,
              padding: '0.65rem 1.1rem',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            📥 Export CSV
          </a>
        </div>
      </div>

      {/* Transactions Table */}
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.875rem',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: colors.surfaceSubtle,
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.5px',
              }}
            >
              <th style={{ padding: '0.875rem 1.25rem' }}>Transaction ID</th>
              <th style={{ padding: '0.875rem 1rem' }}>Type</th>
              <th style={{ padding: '0.875rem 1rem' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '0.875rem 1rem' }}>Reference / Note</th>
              <th style={{ padding: '0.875rem 1rem' }}>Date &amp; Time</th>
              <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  No transactions found matching filter criteria.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => {
                const typeStyle = getTypeColor(tx.type);
                const statusStyle = getStatusColor(tx.status);
                const isReversible = tx.status === 'completed' && tx.type !== 'reversal';

                return (
                  <tr
                    key={tx.id}
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = colors.background)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                  >
                    {/* Transaction ID */}
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <button
                        onClick={() => setDetailTx(tx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontWeight: 700,
                          color: colors.primary,
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textAlign: 'left',
                        }}
                      >
                        {tx.id.substring(0, 8)}...
                      </button>
                    </td>

                    {/* Type Badge */}
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          backgroundColor: typeStyle.bg,
                          color: typeStyle.text,
                          textTransform: 'uppercase',
                        }}
                      >
                        {tx.type}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.text,
                          textTransform: 'capitalize',
                        }}
                      >
                        ● {tx.status}
                      </span>
                    </td>

                    {/* Amount */}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: colors.textPrimary,
                          fontSize: '0.95rem',
                        }}
                      >
                        {formatCentavosToPHP(tx.amount)}
                      </div>
                    </td>

                    {/* Reference */}
                    <td style={{ padding: '1rem', color: colors.textSecondary }}>
                      {tx.reference || 'Standard transaction'}
                    </td>

                    {/* Date */}
                    <td
                      style={{
                        padding: '1rem',
                        color: colors.textMuted,
                        fontSize: '0.8rem',
                      }}
                    >
                      {new Date(tx.created_at).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        <button
                          onClick={() => setDetailTx(tx)}
                          style={{
                            backgroundColor: colors.surfaceSubtle,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Details
                        </button>

                        {isReversible && (
                          <button
                            onClick={() => openReversalModal(tx)}
                            title="Reverse completed transaction"
                            style={{
                              backgroundColor: colors.errorLight,
                              border: `1px solid ${colors.error}`,
                              color: colors.error,
                              padding: '0.35rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ↩ Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Reversal Confirmation */}
      {reversalTx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: colors.error }}>
                Reverse Transaction
              </h3>
              <button
                onClick={closeReversalModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: colors.errorLight,
                border: `1px solid ${colors.error}`,
                borderRadius: '10px',
                padding: '1rem',
              }}
            >
              <div style={{ fontWeight: 700, color: colors.error, fontSize: '0.85rem' }}>
                ⚠️ Financial Reversal Invariant Warning:
              </div>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: colors.error,
                  marginTop: '0.35rem',
                  lineHeight: 1.4,
                }}
              >
                This action creates an atomic compensating reversal in the double-entry
                ledger with opposite directions and marks transaction{' '}
                <code>{reversalTx.id.substring(0, 8)}</code> as reversed. Compensating
                debits will be checked under row lock to prevent negative balances.
              </p>
            </div>

            {/* Details Box */}
            <div
              style={{
                backgroundColor: colors.background,
                padding: '0.875rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
              }}
            >
              <div>
                <span style={{ color: colors.textMuted }}>Original Type:</span>{' '}
                <strong style={{ textTransform: 'uppercase' }}>{reversalTx.type}</strong>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Amount:</span>{' '}
                <strong>{formatCentavosToPHP(reversalTx.amount)}</strong>
              </div>
            </div>

            {reversalError && (
              <div
                style={{
                  backgroundColor: colors.errorLight,
                  border: `1px solid ${colors.error}`,
                  borderRadius: '8px',
                  padding: '0.75rem',
                  fontSize: '0.85rem',
                  color: colors.error,
                  fontWeight: 600,
                }}
              >
                ⚠️ {reversalError}
              </div>
            )}

            <form
              onSubmit={handleConfirmReversal}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: colors.textPrimary,
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem',
                  }}
                >
                  Mandatory Operational Reversal Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State official reason for reversing this transaction (e.g. Disputed transfer, customer error, duplicate debit)..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={closeReversalModal}
                  disabled={isReversing}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReversing || !reversalReason.trim()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: colors.error,
                    color: colors.textInverse,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: isReversing || !reversalReason.trim() ? 0.6 : 1,
                  }}
                >
                  {isReversing ? 'Processing Reversal...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transaction Details */}
      {detailTx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: colors.textPrimary,
                }}
              >
                Transaction Record
              </h3>
              <button
                onClick={() => setDetailTx(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: colors.background,
                padding: '1.25rem',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Transaction ID</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                  {detailTx.id}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Type</span>
                <span style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                  {detailTx.type}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Status</span>
                <span style={{ fontWeight: 800, textTransform: 'capitalize' }}>
                  {detailTx.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Amount</span>
                <span
                  style={{ fontWeight: 800, color: colors.primary, fontSize: '1.1rem' }}
                >
                  {formatCentavosToPHP(detailTx.amount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Reference</span>
                <span style={{ fontWeight: 600 }}>{detailTx.reference || 'None'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Idempotency Key</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: colors.textSecondary,
                  }}
                >
                  {detailTx.idempotency_key || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Initiated By</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {detailTx.initiated_by || 'System'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.textMuted }}>Timestamp</span>
                <span>{new Date(detailTx.created_at).toLocaleString('en-PH')}</span>
              </div>
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}
            >
              <button
                onClick={() => setDetailTx(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.surfaceSubtle,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
