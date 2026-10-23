'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, ShieldAlert, ShieldCheck, Eye } from 'lucide-react';
import {
  formatCentavosToPHP,
  type AdminUserItem,
  type AccountBalance,
  type ProfileStatus,
  type AccountType,
} from '@davao-bank/shared';
import { setUserStatusAction, openAccountAction } from '../actions';
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

interface UsersClientProps {
  initialUsers: AdminUserItem[];
  allAccounts: AccountBalance[];
}

export function UsersClient({ initialUsers, allAccounts }: UsersClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'admin'>('all');

  // Status Modal State
  const [statusModalUser, setStatusModalUser] = useState<AdminUserItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<ProfileStatus>('suspended');

  // Open Account Modal State
  const [openAccModalUser, setOpenAccModalUser] = useState<AdminUserItem | null>(null);
  const [newAccType, setNewAccType] = useState<AccountType>('savings');
  const [isOpeningAcc, setIsOpeningAcc] = useState(false);
  const [openAccError, setOpenAccError] = useState<string | null>(null);

  // Drawer Detail State
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserItem | null>(
    null
  );

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

  const handleConfirmStatusChange = async (reason: string) => {
    if (!statusModalUser) return;
    const res = await setUserStatusAction(statusModalUser.id, targetStatus, reason);

    if (res.success) {
      setStatusModalUser(null);
      router.refresh();
    } else {
      throw new Error(res.error || 'Failed to update user status');
    }
  };

  const handleConfirmOpenAccount = async () => {
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

  const userAccounts = (userId: string) =>
    allAccounts.filter((a) => a.user_id === userId);

  const columns = [
    {
      key: 'name',
      header: 'Full Name / ID',
      render: (u: AdminUserItem) => (
        <div>
          <div style={{ fontWeight: 700 }}>{u.full_name || 'Unnamed User'}</div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {u.id.substring(0, 8)}...
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email / Phone',
      render: (u: AdminUserItem) => (
        <div>
          <div>{u.email}</div>
          {u.phone ? (
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {u.phone}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AdminUserItem) => (
        <Badge label={u.role} variant={u.role === 'admin' ? 'info' : 'neutral'} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUserItem) => <StatusBadge status={u.status} />,
    },
    {
      key: 'accounts',
      header: 'Holdings',
      align: 'right' as const,
      render: (u: AdminUserItem) => {
        const accs = userAccounts(u.id);
        const total = accs.reduce((sum, a) => sum + a.balance, 0);
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }} className="tabular-nums">
              {formatCentavosToPHP(total)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {accs.length} account{accs.length === 1 ? '' : 's'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (u: AdminUserItem) => (
        <div
          style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedUserDetail(u)}
            title="View Details"
          >
            <Eye size={16} />
          </Button>

          {u.status === 'active' ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setStatusModalUser(u);
                setTargetStatus('suspended');
              }}
            >
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStatusModalUser(u);
                setTargetStatus('active');
              }}
            >
              Activate
            </Button>
          )}

          <Button size="sm" variant="primary" onClick={() => setOpenAccModalUser(u)}>
            + Account
          </Button>
        </div>
      ),
    },
  ];

  const drawerAccounts = selectedUserDetail ? userAccounts(selectedUserDetail.id) : [];

  return (
    <>
      <FilterBar>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Input
            placeholder="Search by name, email, phone, or ID..."
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
              { value: 'suspended', label: 'Suspended Only' },
            ]}
          />
        </div>

        <div style={{ width: 160 }}>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            options={[
              { value: 'all', label: 'All Roles' },
              { value: 'customer', label: 'Customer Only' },
              { value: 'admin', label: 'Admin Only' },
            ]}
          />
        </div>
      </FilterBar>

      <Table
        columns={columns}
        data={filteredUsers}
        keyExtractor={(u) => u.id}
        onRowClick={(u) => setSelectedUserDetail(u)}
      />

      {/* Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedUserDetail)}
        onClose={() => setSelectedUserDetail(null)}
        title={selectedUserDetail?.full_name || 'Customer Details'}
      >
        {selectedUserDetail && (
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
                    User ID
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {selectedUserDetail.id}
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
                    Email
                  </div>
                  <div>{selectedUserDetail.email}</div>
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
                    <StatusBadge status={selectedUserDetail.status} />
                  </div>
                </div>
              </div>
            </Card>

            <div>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  marginBottom: 'var(--space-sm)',
                }}
              >
                Accounts ({drawerAccounts.length})
              </h3>
              {drawerAccounts.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  No accounts provisioned.
                </p>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-sm)',
                  }}
                >
                  {drawerAccounts.map((acc) => (
                    <Card key={acc.account_id} variant="subtle">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }} className="tabular-nums">
                            {acc.account_number}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--color-text-secondary)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {acc.type} · {acc.currency}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div
                            style={{ fontWeight: 800, color: 'var(--color-primary)' }}
                            className="tabular-nums"
                          >
                            {formatCentavosToPHP(acc.balance)}
                          </div>
                          <StatusBadge status={acc.status} />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Confirm Status Change Dialog */}
      {statusModalUser && (
        <ConfirmDialog
          isOpen={Boolean(statusModalUser)}
          onClose={() => setStatusModalUser(null)}
          onConfirm={handleConfirmStatusChange}
          title={`${targetStatus === 'suspended' ? 'Suspend' : 'Activate'} User`}
          description={`Are you sure you want to mark ${statusModalUser.full_name || statusModalUser.email} as ${targetStatus}?`}
          ledgerEffect={
            targetStatus === 'suspended'
              ? 'Blocks all client money operations (transfers, cash-in, cash-out) and revokes privileges.'
              : 'Restores standard customer access to accounts and banking functions.'
          }
          variant={targetStatus === 'suspended' ? 'destructive' : 'info'}
          confirmText={`${targetStatus === 'suspended' ? 'Suspend' : 'Activate'} Account`}
        />
      )}

      {/* Provision Account Dialog */}
      {openAccModalUser && (
        <Drawer
          isOpen={Boolean(openAccModalUser)}
          onClose={() => setOpenAccModalUser(null)}
          title="Open New Account"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpenAccModalUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmOpenAccount} loading={isOpeningAcc}>
                Provision Account
              </Button>
            </>
          }
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-base)' }}
          >
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>
              Provision a new simulated ledger account for{' '}
              <strong>{openAccModalUser.full_name || openAccModalUser.email}</strong>.
            </p>

            <Select
              label="Account Type"
              value={newAccType}
              onChange={(e) => setNewAccType(e.target.value as AccountType)}
              options={[
                { value: 'savings', label: 'Savings Account' },
                { value: 'checking', label: 'Checking Account' },
              ]}
            />

            {openAccError ? (
              <p style={{ color: 'var(--color-red-text)', fontSize: '0.875rem' }}>
                {openAccError}
              </p>
            ) : null}
          </div>
        </Drawer>
      )}
    </>
  );
}
