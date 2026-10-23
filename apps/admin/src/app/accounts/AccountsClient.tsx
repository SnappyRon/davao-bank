'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  colors,
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

interface AccountsClientProps {
  initialAccounts: AccountBalance[];
  users: AdminUserItem[];
}

export function AccountsClient({ initialAccounts, users }: AccountsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'frozen' | 'closed'
  >('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'savings' | 'checking'>('all');

  // Status Change Modal State
  const [statusModalAccount, setStatusModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [targetStatus, setTargetStatus] = useState<AccountStatus>('frozen');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Balance Adjustment Modal State
  const [adjustModalAccount, setAdjustModalAccount] = useState<AccountBalance | null>(
    null
  );
  const [adjustDirection, setAdjustDirection] = useState<LedgerDirection>('credit');
  const [adjustAmountStr, setAdjustAmountStr] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustIdempotencyKey, setAdjustIdempotencyKey] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const openAdjustModal = (acc: AccountBalance) => {
    setAdjustModalAccount(acc);
    setAdjustDirection('credit');
    setAdjustAmountStr('');
    setAdjustReason('');
    setAdjustError(null);
    setAdjustIdempotencyKey(generateIdempotencyKey('admin_adj'));
  };

  const closeAdjustModal = () => {
    if (isAdjusting) return;
    setAdjustModalAccount(null);
    setAdjustAmountStr('');
    setAdjustReason('');
    setAdjustError(null);
    setAdjustIdempotencyKey('');
  };

  // Open Account Modal State
  const [isOpenAccModalVisible, setIsOpenAccModalVisible] = useState(false);
  const [openAccUserId, setOpenAccUserId] = useState<string>(users[0]?.id || '');
  const [openAccType, setOpenAccType] = useState<AccountType>('savings');
  const [isOpeningAcc, setIsOpeningAcc] = useState(false);
  const [openAccError, setOpenAccError] = useState<string | null>(null);

  // Map users for fast owner lookup
  const userMap: Record<string, AdminUserItem> = {};
  users.forEach((u) => {
    userMap[u.id] = u;
  });

  // Filter accounts
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

  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalAccount) return;
    if (!statusReason.trim()) {
      setStatusError('Reason is mandatory for changing account status');
      return;
    }

    setIsUpdatingStatus(true);
    setStatusError(null);

    const res = await setAccountStatusAction(
      statusModalAccount.account_id,
      targetStatus,
      statusReason.trim()
    );
    setIsUpdatingStatus(false);

    if (res.success) {
      setStatusModalAccount(null);
      setStatusReason('');
      router.refresh();
    } else {
      setStatusError(res.error || 'Failed to update account status');
    }
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalAccount) return;

    const centavos = phpToCentavos(adjustAmountStr);
    if (centavos <= 0) {
      setAdjustError('Adjustment amount must be greater than ₱0.00');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('Reason is mandatory for manual balance adjustments');
      return;
    }

    if (adjustDirection === 'debit' && centavos > adjustModalAccount.balance) {
      setAdjustError(
        `Adjustment debit of ${formatCentavosToPHP(centavos)} exceeds available balance of ${formatCentavosToPHP(adjustModalAccount.balance)}`
      );
      return;
    }

    setIsAdjusting(true);
    setAdjustError(null);

    // Reuse idempotency key across retries and double submits
    const idempotencyKey = adjustIdempotencyKey || generateIdempotencyKey('admin_adj');
    if (!adjustIdempotencyKey) {
      setAdjustIdempotencyKey(idempotencyKey);
    }

    const res = await adjustBalanceAction(
      adjustModalAccount.account_id,
      centavos,
      adjustDirection,
      adjustReason.trim(),
      idempotencyKey
    );
    setIsAdjusting(false);

    if (res.success) {
      setAdjustModalAccount(null);
      setAdjustAmountStr('');
      setAdjustReason('');
      setAdjustIdempotencyKey('');
      router.refresh();
    } else {
      setAdjustError(res.error || 'Failed to perform balance adjustment');
    }
  };

  const handleConfirmOpenAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openAccUserId) {
      setOpenAccError('Please select a customer');
      return;
    }

    setIsOpeningAcc(true);
    setOpenAccError(null);

    const res = await openAccountAction(openAccUserId, openAccType, 'PHP');
    setIsOpeningAcc(false);

    if (res.success) {
      setIsOpenAccModalVisible(false);
      router.refresh();
    } else {
      setOpenAccError(res.error || 'Failed to open account');
    }
  };

  // Preview projected balance for adjustment modal
  const adjustCentavos = phpToCentavos(adjustAmountStr);
  const projectedBalance = adjustModalAccount
    ? adjustDirection === 'credit'
      ? adjustModalAccount.balance + adjustCentavos
      : adjustModalAccount.balance - adjustCentavos
    : 0;

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
            placeholder="Search by account number, owner name, or UUID..."
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
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'active' | 'frozen' | 'closed')
            }
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
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
            <option value="closed">Closed</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'savings' | 'checking')
            }
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
            <option value="savings">Savings</option>
            <option value="checking">Checking</option>
          </select>

          {/* Open Account Button */}
          <button
            onClick={() => {
              setIsOpenAccModalVisible(true);
              setOpenAccError(null);
            }}
            style={{
              backgroundColor: colors.primary,
              color: colors.textInverse,
              border: 'none',
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
            + Open Account
          </button>
        </div>
      </div>

      {/* Accounts Table */}
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
              <th style={{ padding: '0.875rem 1.25rem' }}>Account Number</th>
              <th style={{ padding: '0.875rem 1rem' }}>Customer / Owner</th>
              <th style={{ padding: '0.875rem 1rem' }}>Type</th>
              <th style={{ padding: '0.875rem 1rem' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                Authoritative Balance
              </th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                Ledger Records
              </th>
              <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  No deposit accounts found matching criteria.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => {
                const owner = userMap[acc.user_id];

                return (
                  <tr
                    key={acc.account_id}
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
                    {/* Account Number */}
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: colors.textPrimary,
                          fontFamily: 'monospace',
                          fontSize: '0.95rem',
                        }}
                      >
                        {acc.account_number}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textMuted,
                          fontFamily: 'monospace',
                        }}
                      >
                        {acc.account_id.substring(0, 8)}...
                      </div>
                    </td>

                    {/* Owner */}
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                        {owner?.full_name || 'Customer'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        {owner?.email || '—'}
                      </div>
                    </td>

                    {/* Type & Currency */}
                    <td style={{ padding: '1rem' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                        {acc.type}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textMuted,
                          marginLeft: '4px',
                        }}
                      >
                        ({acc.currency})
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor:
                            acc.status === 'active'
                              ? colors.successLight
                              : acc.status === 'frozen'
                                ? colors.warningLight
                                : colors.errorLight,
                          color:
                            acc.status === 'active'
                              ? colors.successDark
                              : acc.status === 'frozen'
                                ? colors.warning
                                : colors.error,
                          textTransform: 'capitalize',
                        }}
                      >
                        ● {acc.status}
                      </span>
                    </td>

                    {/* Balance */}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: colors.primary,
                          fontSize: '1.05rem',
                        }}
                      >
                        {formatCentavosToPHP(acc.balance)}
                      </div>
                    </td>

                    {/* Ledger Entries */}
                    <td
                      style={{
                        padding: '1rem',
                        textAlign: 'center',
                        color: colors.textSecondary,
                      }}
                    >
                      {acc.ledger_entry_count}
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
                        {/* Adjust Balance */}
                        <button
                          onClick={() => openAdjustModal(acc)}
                          disabled={acc.status === 'closed'}
                          title="Manual Balance Adjustment"
                          style={{
                            backgroundColor: colors.surfaceSubtle,
                            border: `1px solid ${colors.border}`,
                            color: colors.primary,
                            padding: '0.4rem 0.7rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: acc.status === 'closed' ? 'not-allowed' : 'pointer',
                            opacity: acc.status === 'closed' ? 0.5 : 1,
                          }}
                        >
                          ⚖️ Adjust
                        </button>

                        {/* Status Controls */}
                        {acc.status === 'active' && (
                          <button
                            onClick={() => {
                              setStatusModalAccount(acc);
                              setTargetStatus('frozen');
                              setStatusReason('');
                              setStatusError(null);
                            }}
                            style={{
                              backgroundColor: colors.warningLight,
                              border: `1px solid ${colors.warning}`,
                              color: colors.warning,
                              padding: '0.4rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Freeze
                          </button>
                        )}

                        {acc.status === 'frozen' && (
                          <button
                            onClick={() => {
                              setStatusModalAccount(acc);
                              setTargetStatus('active');
                              setStatusReason('');
                              setStatusError(null);
                            }}
                            style={{
                              backgroundColor: colors.successLight,
                              border: `1px solid ${colors.success}`,
                              color: colors.successDark,
                              padding: '0.4rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Unfreeze
                          </button>
                        )}

                        {acc.status !== 'closed' && (
                          <button
                            onClick={() => {
                              setStatusModalAccount(acc);
                              setTargetStatus('closed');
                              setStatusReason('');
                              setStatusError(null);
                            }}
                            title="Close Account (requires zero balance)"
                            style={{
                              backgroundColor: colors.errorLight,
                              border: `1px solid ${colors.error}`,
                              color: colors.error,
                              padding: '0.4rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Close
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

      {/* Modal: Balance Adjustment (Credit / Debit) */}
      {adjustModalAccount && (
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
              maxWidth: '500px',
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
                style={{ fontSize: '1.2rem', fontWeight: 800, color: colors.textPrimary }}
              >
                Manual Balance Adjustment
              </h3>
              <button
                onClick={closeAdjustModal}
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

            {/* Account Details Box */}
            <div
              style={{
                backgroundColor: colors.background,
                padding: '1rem',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Account
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    color: colors.textPrimary,
                    fontFamily: 'monospace',
                  }}
                >
                  {adjustModalAccount.account_number}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Current Balance
                </div>
                <div
                  style={{ fontWeight: 800, color: colors.primary, fontSize: '1.1rem' }}
                >
                  {formatCentavosToPHP(adjustModalAccount.balance)}
                </div>
              </div>
            </div>

            {adjustError && (
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
                ⚠️ {adjustError}
              </div>
            )}

            <form
              onSubmit={handleConfirmAdjustment}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
            >
              {/* Direction Selector */}
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
                  Adjustment Type *
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('credit')}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border:
                        adjustDirection === 'credit'
                          ? `2px solid ${colors.success}`
                          : `1px solid ${colors.border}`,
                      backgroundColor:
                        adjustDirection === 'credit'
                          ? colors.successLight
                          : colors.surface,
                      color:
                        adjustDirection === 'credit'
                          ? colors.successDark
                          : colors.textPrimary,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Credit Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('debit')}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border:
                        adjustDirection === 'debit'
                          ? `2px solid ${colors.error}`
                          : `1px solid ${colors.border}`,
                      backgroundColor:
                        adjustDirection === 'debit' ? colors.errorLight : colors.surface,
                      color:
                        adjustDirection === 'debit' ? colors.error : colors.textPrimary,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    - Debit Account
                  </button>
                </div>
              </div>

              {/* Amount Input */}
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
                  Amount in PHP *
                </label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '10px',
                      fontWeight: 700,
                      color: colors.textSecondary,
                    }}
                  >
                    ₱
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={adjustAmountStr}
                    onChange={(e) => setAdjustAmountStr(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 1rem 0.65rem 2rem',
                      borderRadius: '8px',
                      border: `1px solid ${colors.border}`,
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Projected Balance Callout */}
              {adjustCentavos > 0 && (
                <div
                  style={{
                    backgroundColor: colors.surfaceSubtle,
                    padding: '0.75rem',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ color: colors.textSecondary }}>
                    Projected Balance After Adjustment:
                  </span>
                  <strong
                    style={{
                      color: projectedBalance < 0 ? colors.error : colors.primary,
                      fontSize: '0.95rem',
                    }}
                  >
                    {formatCentavosToPHP(projectedBalance)}
                  </strong>
                </div>
              )}

              {/* Mandatory Reason */}
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
                  Mandatory Operational Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State reason (e.g. Fee waiver, manual deposit verification, dispute resolution)..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
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
                  onClick={closeAdjustModal}
                  disabled={isAdjusting}
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
                  disabled={
                    isAdjusting ||
                    adjustCentavos <= 0 ||
                    !adjustReason.trim() ||
                    projectedBalance < 0
                  }
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity:
                      isAdjusting ||
                      adjustCentavos <= 0 ||
                      !adjustReason.trim() ||
                      projectedBalance < 0
                        ? 0.6
                        : 1,
                  }}
                >
                  {isAdjusting
                    ? 'Processing Adjustment...'
                    : 'Confirm Balance Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Status Change (Freeze / Unfreeze / Close) */}
      {statusModalAccount && (
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
              maxWidth: '480px',
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
                style={{ fontSize: '1.2rem', fontWeight: 800, color: colors.textPrimary }}
              >
                {targetStatus === 'frozen'
                  ? 'Freeze Account'
                  : targetStatus === 'closed'
                    ? 'Close Account'
                    : 'Activate Account'}
              </h3>
              <button
                onClick={() => setStatusModalAccount(null)}
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

            <p style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
              Update status for account{' '}
              <strong style={{ color: colors.textPrimary }}>
                {statusModalAccount.account_number}
              </strong>{' '}
              to{' '}
              <strong style={{ color: colors.primary }}>
                {targetStatus.toUpperCase()}
              </strong>
              .
            </p>

            {statusError && (
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
                ⚠️ {statusError}
              </div>
            )}

            <form
              onSubmit={handleConfirmStatusChange}
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
                  Mandatory Operational Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State reason for freezing or altering account status..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
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
                  onClick={() => setStatusModalAccount(null)}
                  disabled={isUpdatingStatus}
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
                  disabled={isUpdatingStatus || !statusReason.trim()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor:
                      targetStatus === 'closed' ? colors.error : colors.primary,
                    color: colors.textInverse,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: isUpdatingStatus || !statusReason.trim() ? 0.6 : 1,
                  }}
                >
                  {isUpdatingStatus ? 'Updating...' : `Confirm ${targetStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Open Account */}
      {isOpenAccModalVisible && (
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
              maxWidth: '460px',
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
                style={{ fontSize: '1.2rem', fontWeight: 800, color: colors.textPrimary }}
              >
                Open New Deposit Account
              </h3>
              <button
                onClick={() => setIsOpenAccModalVisible(false)}
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

            {openAccError && (
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
                ⚠️ {openAccError}
              </div>
            )}

            <form
              onSubmit={handleConfirmOpenAccount}
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
                  Target Customer *
                </label>
                <select
                  value={openAccUserId}
                  onChange={(e) => setOpenAccUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '0.875rem',
                    backgroundColor: colors.surface,
                  }}
                >
                  {users
                    .filter((u) => u.role === 'customer')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email} ({u.email})
                      </option>
                    ))}
                </select>
              </div>

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
                  Account Type
                </label>
                <select
                  value={openAccType}
                  onChange={(e) => setOpenAccType(e.target.value as AccountType)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    fontSize: '0.875rem',
                    backgroundColor: colors.surface,
                  }}
                >
                  <option value="savings">Savings Account (PHP)</option>
                  <option value="checking">Checking Account (PHP)</option>
                </select>
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
                  onClick={() => setIsOpenAccModalVisible(false)}
                  disabled={isOpeningAcc}
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
                  disabled={isOpeningAcc}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isOpeningAcc ? 'Opening...' : 'Open Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
