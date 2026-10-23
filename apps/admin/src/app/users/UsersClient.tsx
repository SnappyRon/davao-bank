'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  colors,
  formatCentavosToPHP,
  type AdminUserItem,
  type AccountBalance,
  type ProfileStatus,
  type AccountType,
} from '@davao-bank/shared';
import { setUserStatusAction, openAccountAction } from '../actions';

interface UsersClientProps {
  initialUsers: AdminUserItem[];
  allAccounts: AccountBalance[];
}

export function UsersClient({ initialUsers, allAccounts }: UsersClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'admin'>('all');

  // Modal State for Suspend / Activate
  const [statusModalUser, setStatusModalUser] = useState<AdminUserItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<ProfileStatus>('suspended');
  const [reason, setReason] = useState('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Modal State for Open Account
  const [openAccModalUser, setOpenAccModalUser] = useState<AdminUserItem | null>(null);
  const [newAccType, setNewAccType] = useState<AccountType>('savings');
  const [isOpeningAcc, setIsOpeningAcc] = useState(false);
  const [openAccError, setOpenAccError] = useState<string | null>(null);

  // Selected User for Detail View Drawer
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserItem | null>(
    null
  );

  // Filtered Users List
  const filteredUsers = initialUsers.filter((user) => {
    const matchesSearch =
      (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone || '').includes(searchTerm) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleOpenStatusModal = (user: AdminUserItem, newStatus: ProfileStatus) => {
    setStatusModalUser(user);
    setTargetStatus(newStatus);
    setReason('');
    setStatusError(null);
  };

  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalUser) return;
    if (!reason.trim()) {
      setStatusError('Reason is mandatory for changing profile status');
      return;
    }

    setIsSubmittingStatus(true);
    setStatusError(null);

    const res = await setUserStatusAction(
      statusModalUser.id,
      targetStatus,
      reason.trim()
    );
    setIsSubmittingStatus(false);

    if (res.success) {
      setStatusModalUser(null);
      setReason('');
      router.refresh();
    } else {
      setStatusError(res.error || 'Failed to update user status');
    }
  };

  const handleConfirmOpenAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openAccModalUser) return;

    setIsOpeningAcc(true);
    setOpenAccError(null);

    const res = await openAccountAction(openAccModalUser.id, newAccType, 'PHP');
    setIsOpeningAcc(false);

    if (res.success) {
      setOpenAccModalUser(null);
      router.refresh();
    } else {
      setOpenAccError(res.error || 'Failed to open account');
    }
  };

  const getUserAccounts = (userId: string) => {
    return allAccounts.filter((a) => a.user_id === userId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Controls: Search & Filters */}
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
            placeholder="Search by customer name, email, phone, or UUID..."
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

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')
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
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as 'all' | 'customer' | 'admin')
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
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="admin">Administrators</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
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
              <th style={{ padding: '0.875rem 1.25rem' }}>User Profile</th>
              <th style={{ padding: '0.875rem 1rem' }}>Email &amp; Verification</th>
              <th style={{ padding: '0.875rem 1rem' }}>Phone</th>
              <th style={{ padding: '0.875rem 1rem' }}>Role</th>
              <th style={{ padding: '0.875rem 1rem' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem' }}>Accounts</th>
              <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  No customer profiles found matching your search criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const userAccounts = getUserAccounts(user.id);
                const isCustomer = user.role === 'customer';

                return (
                  <tr
                    key={user.id}
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
                    {/* User Profile */}
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '18px',
                            backgroundColor: colors.primaryLight,
                            color: colors.primary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                          }}
                        >
                          {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: colors.textPrimary }}>
                            {user.full_name || 'Unnamed Customer'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: colors.textMuted,
                              fontFamily: 'monospace',
                            }}
                          >
                            {user.id.substring(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Email & Verification */}
                    <td style={{ padding: '1rem' }}>
                      <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
                        {user.email}
                      </div>
                      <div style={{ marginTop: '0.2rem' }}>
                        {user.email_confirmed ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: colors.success,
                              backgroundColor: colors.successLight,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            ✓ Verified
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: colors.warning,
                              backgroundColor: colors.warningLight,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Unverified
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Phone */}
                    <td style={{ padding: '1rem', color: colors.textSecondary }}>
                      {user.phone || '—'}
                    </td>

                    {/* Role */}
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color:
                            user.role === 'admin' ? colors.primary : colors.textSecondary,
                        }}
                      >
                        {user.role}
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
                            user.status === 'active'
                              ? colors.successLight
                              : colors.errorLight,
                          color:
                            user.status === 'active' ? colors.successDark : colors.error,
                          textTransform: 'capitalize',
                        }}
                      >
                        ● {user.status}
                      </span>
                    </td>

                    {/* Accounts Count */}
                    <td style={{ padding: '1rem' }}>
                      <button
                        onClick={() => setSelectedUserDetail(user)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.primary,
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontSize: '0.85rem',
                        }}
                      >
                        {userAccounts.length} account
                        {userAccounts.length === 1 ? '' : 's'}
                      </button>
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
                        {isCustomer && (
                          <button
                            onClick={() => setOpenAccModalUser(user)}
                            title="Open New Account"
                            style={{
                              backgroundColor: colors.surfaceSubtle,
                              border: `1px solid ${colors.border}`,
                              color: colors.textPrimary,
                              padding: '0.4rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            + Open Acc
                          </button>
                        )}

                        {user.status === 'active' ? (
                          <button
                            onClick={() => handleOpenStatusModal(user, 'suspended')}
                            style={{
                              backgroundColor: colors.errorLight,
                              border: `1px solid ${colors.error}`,
                              color: colors.error,
                              padding: '0.4rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenStatusModal(user, 'active')}
                            style={{
                              backgroundColor: colors.successLight,
                              border: `1px solid ${colors.success}`,
                              color: colors.successDark,
                              padding: '0.4rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Activate
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

      {/* Confirmation Modal: Suspend / Activate User */}
      {statusModalUser && (
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
                {targetStatus === 'suspended'
                  ? 'Suspend Customer Account'
                  : 'Activate Customer Account'}
              </h3>
              <button
                onClick={() => setStatusModalUser(null)}
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

            <p
              style={{
                fontSize: '0.875rem',
                color: colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              You are about to change the profile status of{' '}
              <strong style={{ color: colors.textPrimary }}>
                {statusModalUser.full_name || statusModalUser.email}
              </strong>{' '}
              to{' '}
              <strong
                style={{
                  color: targetStatus === 'suspended' ? colors.error : colors.success,
                }}
              >
                {targetStatus.toUpperCase()}
              </strong>
              . This privileged action is strictly audited.
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
                  placeholder="State the official compliance or administrative reason for this status change..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
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
                  onClick={() => setStatusModalUser(null)}
                  disabled={isSubmittingStatus}
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
                  disabled={isSubmittingStatus || !reason.trim()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor:
                      targetStatus === 'suspended' ? colors.error : colors.success,
                    color: colors.textInverse,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: isSubmittingStatus || !reason.trim() ? 0.6 : 1,
                  }}
                >
                  {isSubmittingStatus
                    ? 'Updating...'
                    : `Confirm ${targetStatus === 'suspended' ? 'Suspension' : 'Activation'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Open New Account */}
      {openAccModalUser && (
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
                Open Deposit Account
              </h3>
              <button
                onClick={() => setOpenAccModalUser(null)}
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
              Provision an additional deposit account for customer{' '}
              <strong style={{ color: colors.textPrimary }}>
                {openAccModalUser.full_name || openAccModalUser.email}
              </strong>
              .
            </p>

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
                  Account Type
                </label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
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
                  onClick={() => setOpenAccModalUser(null)}
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
                  {isOpeningAcc ? 'Opening Account...' : 'Open Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details & Accounts Drawer / Modal */}
      {selectedUserDetail && (
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
              maxWidth: '560px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: colors.textPrimary,
                  }}
                >
                  {selectedUserDetail.full_name || 'Customer'} Details
                </h3>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: colors.textMuted,
                    marginTop: '0.2rem',
                  }}
                >
                  User ID: {selectedUserDetail.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
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

            {/* Profile Overview */}
            <div
              style={{
                backgroundColor: colors.background,
                padding: '1rem',
                borderRadius: '10px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                  Email Address
                </div>
                <div style={{ fontWeight: 600 }}>{selectedUserDetail.email}</div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                  Verification Status
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: selectedUserDetail.email_confirmed
                      ? colors.success
                      : colors.warning,
                  }}
                >
                  {selectedUserDetail.email_confirmed
                    ? 'Email Confirmed'
                    : 'Pending Verification'}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Phone</div>
                <div style={{ fontWeight: 600 }}>
                  {selectedUserDetail.phone || 'None'}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                  Registered On
                </div>
                <div style={{ fontWeight: 600 }}>
                  {new Date(selectedUserDetail.created_at).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            {/* Accounts Sub-list */}
            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: colors.textPrimary,
                  textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}
              >
                Customer Accounts ({getUserAccounts(selectedUserDetail.id).length})
              </div>

              {getUserAccounts(selectedUserDetail.id).length === 0 ? (
                <div
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: '0.85rem',
                    border: `1px dashed ${colors.border}`,
                    borderRadius: '8px',
                  }}
                >
                  No accounts provisioned for this user.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {getUserAccounts(selectedUserDetail.id).map((acc) => (
                    <div
                      key={acc.account_id}
                      style={{
                        padding: '0.875rem',
                        borderRadius: '8px',
                        border: `1px solid ${colors.border}`,
                        backgroundColor: colors.background,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: colors.textPrimary,
                            fontFamily: 'monospace',
                          }}
                        >
                          {acc.account_number}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: colors.textMuted,
                            marginTop: '0.15rem',
                          }}
                        >
                          {acc.type.toUpperCase()} &bull; {acc.currency} &bull; Status:{' '}
                          {acc.status}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontWeight: 800,
                            color: colors.primary,
                            fontSize: '1rem',
                          }}
                        >
                          {formatCentavosToPHP(acc.balance)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>
                          {acc.ledger_entry_count} ledger entries
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}
            >
              <button
                onClick={() => setSelectedUserDetail(null)}
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
