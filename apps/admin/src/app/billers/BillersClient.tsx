'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Droplets, Wifi, Smartphone, HelpCircle, Plus, Power } from 'lucide-react';
import { BillerCategory, toUserMessage } from '@davao-bank/shared';
import { adminCreateBillerAction, adminSetBillerActiveAction } from '@/app/actions';
import {
  Table,
  Button,
  Badge,
  Drawer,
  Input,
  Select,
  FilterBar,
  EmptyState,
} from '@/components/ui';
import styles from './Billers.module.css';

export interface AdminBillerRow {
  id: string;
  name: string;
  category: BillerCategory;
  account_id: string;
  account_number: string;
  reference_pattern: string;
  reference_label: string;
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

  // New Biller Drawer
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState<BillerCategory>('electricity');
  const [createRefPattern, setCreateRefPattern] = useState('^[0-9]{10}$');
  const [createRefLabel, setCreateRefLabel] = useState('Account Number');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Toggle active status loading state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleActive = async (biller: AdminBillerRow) => {
    setTogglingId(biller.id);
    const res = await adminSetBillerActiveAction(biller.id, !biller.is_active);
    setTogglingId(null);

    if (!res.success) {
      alert(toUserMessage(res.error || 'Failed to update biller'));
      return;
    }

    router.refresh();
  };

  const handleCreateBiller = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    // Validate regex before sending
    try {
      new RegExp(createRefPattern);
    } catch (err: any) {
      setCreateError(`Invalid regular expression: ${err.message}`);
      setCreating(false);
      return;
    }

    const res = await adminCreateBillerAction(
      createName.trim(),
      createCategory,
      createRefLabel.trim(),
      createRefPattern.trim()
    );

    setCreating(false);

    if (!res.success) {
      setCreateError(toUserMessage(res.error || 'Failed to create biller'));
      return;
    }

    setIsCreateOpen(false);
    setCreateName('');
    setCreateRefPattern('^[0-9]{10}$');
    setCreateRefLabel('Account Number');
    router.refresh();
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
        return <Zap size={14} className={styles.iconElectricity} />;
      case 'water':
        return <Droplets size={14} className={styles.iconWater} />;
      case 'internet':
        return <Wifi size={14} className={styles.iconInternet} />;
      case 'mobile':
        return <Smartphone size={14} className={styles.iconMobile} />;
      default:
        return <HelpCircle size={14} className={styles.iconDefault} />;
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Biller Name',
      render: (b: AdminBillerRow) => (
        <div>
          <div className={styles.billerName}>{b.name}</div>
          <div className={styles.billerAdded}>
            Added: {new Date(b.created_at).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (b: AdminBillerRow) => (
        <span className={styles.categoryBadge}>
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
          <span className={styles.settlementAccount}>{b.account_number}</span>
          <div className={styles.settlementSub}>System checking account</div>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Reference Validation',
      render: (b: AdminBillerRow) => (
        <div>
          <div className={styles.refLabel}>{b.reference_label}</div>
          <code className={styles.refCode}>{b.reference_pattern}</code>
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
        <div className={styles.actionsCell}>
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
      <div className={styles.headerBanner}>
        <div>
          <span className={styles.headerCount}>
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
        <div className={styles.filterSearch}>
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
        <form onSubmit={handleCreateBiller} className={styles.drawerForm}>
          <p className={styles.drawerDesc}>
            Registering a biller will automatically provision an official Davao Bank
            settlement checking account under the secure system profile.
          </p>

          {createError && <div className={styles.errorBox}>{createError}</div>}

          <div>
            <label className={styles.fieldLabel}>Biller Name</label>
            <Input
              placeholder="e.g. Davao Solar Cooperative (demo)"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Category</label>
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
            <label className={styles.fieldLabel}>
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
            <label className={styles.fieldLabel}>
              Reference Pattern (Regular Expression)
            </label>
            <Input
              placeholder="e.g. ^[0-9]{10}$"
              value={createRefPattern}
              onChange={(e) => setCreateRefPattern(e.target.value)}
              required
            />
            <span className={styles.fieldHelp}>
              Must be valid regex. Example:{' '}
              <code>
                ^[0-9]{'{'}10{'}'}$
              </code>{' '}
              for 10 digits.
            </span>
          </div>

          <div className={styles.drawerActions}>
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
