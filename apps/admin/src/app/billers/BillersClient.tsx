'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Zap,
  Droplets,
  Wifi,
  Smartphone,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Power,
  ShieldAlert,
} from 'lucide-react';
import { type BillerCategory } from '@davao-bank/shared';
import { adminCreateBillerAction, adminSetBillerActiveAction } from '../actions';
import {
  Table,
  FilterBar,
  Input,
  Select,
  Badge,
  Button,
  Drawer,
  Card,
  EmptyState,
} from '@/components/ui';

export interface AdminBillerRow {
  id: string;
  name: string;
  category: BillerCategory;
  account_id: string;
  account_number: string;
  account_status: string;
  reference_label: string;
  reference_pattern: string;
  is_active: boolean;
  created_at: string;
}

interface BillersClientProps {
  initialBillers: AdminBillerRow[];
}

export function BillersClient({ initialBillers }: BillersClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | BillerCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Create Biller Modal / Drawer State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState<BillerCategory>('electricity');
  const [createRefLabel, setCreateRefLabel] = useState('Account Number');
  const [createRefPattern, setCreateRefPattern] = useState('^[0-9]{10}$');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleCreateBiller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Biller name is required.');
      return;
    }
    if (!createRefPattern.trim()) {
      setCreateError('Validation regex pattern is required.');
      return;
    }

    try {
      // Validate that pattern is valid regex
      new RegExp(createRefPattern.trim());
    } catch {
      setCreateError('Invalid regular expression pattern.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await adminCreateBillerAction(
        createName.trim(),
        createCategory,
        createRefLabel.trim(),
        createRefPattern.trim()
      );

      if (res.success) {
        setIsCreateOpen(false);
        setCreateName('');
        setCreateRefLabel('Account Number');
        setCreateRefPattern('^[0-9]{10}$');
        router.refresh();
      } else {
        setCreateError(res.error || 'Failed to create biller');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create biller');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (biller: AdminBillerRow) => {
    setTogglingId(biller.id);
    try {
      const res = await adminSetBillerActiveAction(biller.id, !biller.is_active);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || 'Failed to change biller status');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to change biller status');
    } finally {
      setTogglingId(null);
    }
  };

  const filteredBillers = initialBillers.filter((b) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      b.name.toLowerCase().includes(term) ||
      b.account_number.toLowerCase().includes(term) ||
      b.reference_label.toLowerCase().includes(term);

    const matchesCategory = categoryFilter === 'all' || b.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && b.is_active) ||
      (statusFilter === 'inactive' && !b.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getCategoryIcon = (category: BillerCategory) => {
    switch (category) {
      case 'electricity':
        return <Zap size={14} color="#d97706" />;
      case 'water':
        return <Droplets size={14} color="#0284c7" />;
      case 'internet':
        return <Wifi size={14} color="#7c3aed" />;
      case 'mobile':
        return <Smartphone size={14} color="#059669" />;
      default:
        return <HelpCircle size={14} color="#6b7280" />;
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Biller Name',
      render: (b: AdminBillerRow) => (
        <div>
          <div style={{ fontWeight: 700 }}>{b.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Added: {new Date(b.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (b: AdminBillerRow) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {getCategoryIcon(b.category)}
          {b.category}
        </span>
      ),
    },
    {
      key: 'settlement',
      header: 'Settlement Account',
      render: (b: AdminBillerRow) => (
        <div>
          <span
            style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.875rem' }}
          >
            {b.account_number}
          </span>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
            System checking account
          </div>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Reference Validation',
      render: (b: AdminBillerRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
            {b.reference_label}
          </div>
          <code
            style={{
              fontSize: '0.72rem',
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              padding: '2px 6px',
              borderRadius: '4px',
              color: 'var(--color-text-secondary)',
            }}
          >
            {b.reference_pattern}
          </code>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b: AdminBillerRow) =>
        b.is_active ? (
          <Badge label="Active" variant="success" />
        ) : (
          <Badge label="Deactivated" variant="neutral" />
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (b: AdminBillerRow) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant={b.is_active ? 'secondary' : 'primary'}
            onClick={() => handleToggleActive(b)}
            disabled={togglingId === b.id}
            icon={<Power size={14} />}
          >
            {b.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Top Banner and Add Biller Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Configured Billers: <strong>{initialBillers.length}</strong> (
            {initialBillers.filter((b) => b.is_active).length} active)
          </span>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
        >
          Add New Biller
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <Input
            placeholder="Search by biller name, account, label..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as any)}
          options={[
            { label: 'All Categories', value: 'all' },
            { label: 'Electricity', value: 'electricity' },
            { label: 'Water', value: 'water' },
            { label: 'Internet', value: 'internet' },
            { label: 'Mobile', value: 'mobile' },
            { label: 'Other', value: 'other' },
          ]}
        />

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          options={[
            { label: 'All Statuses', value: 'all' },
            { label: 'Active Only', value: 'active' },
            { label: 'Deactivated Only', value: 'inactive' },
          ]}
        />
      </FilterBar>

      {/* Table */}
      <Table
        data={filteredBillers}
        columns={columns}
        keyExtractor={(b) => b.id}
        emptyState={
          <EmptyState
            title="No billers found"
            description="No billers found matching current search and filter criteria."
          />
        }
      />

      {/* Add Biller Drawer */}
      <Drawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New Biller"
      >
        <form
          onSubmit={handleCreateBiller}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Registering a biller will automatically provision an official Davao Bank
            settlement checking account under the secure system profile.
          </p>

          {createError && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-error-bg, #fde8e8)',
                border: '1px solid var(--color-error-border, #f98080)',
                color: 'var(--color-error, #d32f2f)',
                fontSize: '0.85rem',
              }}
            >
              {createError}
            </div>
          )}

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '0.375rem',
              }}
            >
              Biller Name
            </label>
            <Input
              placeholder="e.g. Davao Solar Cooperative (demo)"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '0.375rem',
              }}
            >
              Category
            </label>
            <Select
              value={createCategory}
              onChange={(e) => setCreateCategory(e.target.value as BillerCategory)}
              options={[
                { label: 'Electricity', value: 'electricity' },
                { label: 'Water', value: 'water' },
                { label: 'Internet', value: 'internet' },
                { label: 'Mobile', value: 'mobile' },
                { label: 'Other Services', value: 'other' },
              ]}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '0.375rem',
              }}
            >
              Reference Label (shown to customer)
            </label>
            <Input
              placeholder="e.g. Account Number, Meter ID, Subscriber No."
              value={createRefLabel}
              onChange={(e) => setCreateRefLabel(e.target.value)}
              required
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '0.375rem',
              }}
            >
              Reference Pattern (Regular Expression)
            </label>
            <Input
              placeholder="e.g. ^[0-9]{10}$"
              value={createRefPattern}
              onChange={(e) => setCreateRefPattern(e.target.value)}
              required
            />
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--color-text-secondary)',
                marginTop: '4px',
                display: 'block',
              }}
            >
              Must be valid regex. Example: <code>^[0-9]&#123;10&#125;$</code> for 10
              digits.
            </span>
          </div>

          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Provisioning Account...' : 'Create Biller'}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
