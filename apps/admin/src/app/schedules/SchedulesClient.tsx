'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Eye, Ban } from 'lucide-react';
import {
  formatCentavosToPHP,
  type ScheduledPaymentKind,
  type ScheduledPaymentFrequency,
  type ScheduledPaymentStatus,
} from '@davao-bank/shared';
import { adminRunDueSchedulesAction, adminCancelScheduleAction } from '../actions';
import {
  Table,
  FilterBar,
  Input,
  Select,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
} from '@/components/ui';
import type { AdminScheduleRow, AdminScheduleRunItem } from './types';
import { ScheduleRunsDrawer } from './ScheduleRunsDrawer';
import styles from './Schedules.module.css';

export type { AdminScheduleRow, AdminScheduleRunItem };

interface SchedulesClientProps {
  initialSchedules: AdminScheduleRow[];
}

export function SchedulesClient({ initialSchedules }: SchedulesClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScheduledPaymentStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | ScheduledPaymentKind>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<
    'all' | ScheduledPaymentFrequency
  >('all');

  // Detail Drawer
  const [selectedSchedule, setSelectedSchedule] = useState<AdminScheduleRow | null>(null);

  // Cancellation Confirm Dialog
  const [scheduleToCancel, setScheduleToCancel] = useState<AdminScheduleRow | null>(null);

  // Executor trigger state
  const [runningNow, setRunningNow] = useState(false);
  const [executorNotice, setExecutorNotice] = useState<string | null>(null);

  const handleRunDueNow = async () => {
    setRunningNow(true);
    setExecutorNotice(null);
    try {
      const res = await adminRunDueSchedulesAction();
      if (res.success) {
        const d = res.data as any;
        const msg =
          d?.message ||
          `Evaluated ${d?.processed ?? 0} schedule(s): ${d?.succeeded ?? 0} succeeded, ${d?.failed ?? 0} failed.`;
        setExecutorNotice(msg);
        router.refresh();
      } else {
        setExecutorNotice(`Execution failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setExecutorNotice(`Error: ${err?.message || 'Execution error'}`);
    } finally {
      setRunningNow(false);
    }
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!scheduleToCancel) return;
    const res = await adminCancelScheduleAction(scheduleToCancel.id, reason);
    if (res.success) {
      setScheduleToCancel(null);
      if (selectedSchedule?.id === scheduleToCancel.id) {
        setSelectedSchedule(null);
      }
      router.refresh();
    } else {
      throw new Error(res.error || 'Failed to cancel scheduled payment');
    }
  };

  const filteredSchedules = initialSchedules.filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      s.id.toLowerCase().includes(term) ||
      s.owner_name.toLowerCase().includes(term) ||
      s.from_account_number.toLowerCase().includes(term) ||
      (s.to_account_number && s.to_account_number.toLowerCase().includes(term)) ||
      (s.biller_name && s.biller_name.toLowerCase().includes(term)) ||
      (s.biller_reference && s.biller_reference.toLowerCase().includes(term)) ||
      (s.note && s.note.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchesKind = kindFilter === 'all' || s.kind === kindFilter;
    const matchesFreq = frequencyFilter === 'all' || s.frequency === frequencyFilter;

    return matchesSearch && matchesStatus && matchesKind && matchesFreq;
  });

  const columns = [
    {
      key: 'kind',
      header: 'Kind',
      render: (s: AdminScheduleRow) => (
        <div className={styles.kindCell}>
          {s.kind === 'bill' ? (
            <Badge label="Bill" variant="warning" />
          ) : (
            <Badge label="Transfer" variant="neutral" />
          )}
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Customer',
      render: (s: AdminScheduleRow) => (
        <div>
          <div className={styles.ownerName}>{s.owner_name}</div>
          <div className={styles.ownerAccount}>From: {s.from_account_number}</div>
        </div>
      ),
    },
    {
      key: 'destination',
      header: 'Target / Recipient',
      render: (s: AdminScheduleRow) => (
        <div>
          {s.kind === 'bill' ? (
            <>
              <div className={styles.destTitle}>{s.biller_name}</div>
              <div className={styles.destSub}>Ref: {s.biller_reference}</div>
            </>
          ) : (
            <>
              <div className={styles.destTitle}>Account Transfer</div>
              <div className={styles.destMono}>To: {s.to_account_number || '—'}</div>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (s: AdminScheduleRow) => (
        <span className={`${styles.amountText} tabular-nums`}>
          {formatCentavosToPHP(s.amount)}
        </span>
      ),
    },
    {
      key: 'timing',
      header: 'Schedule / Runs',
      render: (s: AdminScheduleRow) => (
        <div>
          <div className={styles.freqTitle}>{s.frequency}</div>
          <div className={styles.freqSub}>
            Next: {s.status === 'active' ? s.next_run_date : '—'} &bull; Runs:{' '}
            {s.runs_done}
            {s.max_runs ? ` / ${s.max_runs}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s: AdminScheduleRow) => {
        if (s.status === 'active') return <Badge label="Active" variant="success" />;
        if (s.status === 'completed')
          return <Badge label="Completed" variant="neutral" />;
        return <Badge label="Cancelled" variant="danger" />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (s: AdminScheduleRow) => (
        <div className={styles.actionsCell}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedSchedule(s)}
            icon={<Eye size={15} />}
            aria-label="View run history"
          >
            History
          </Button>
          {s.status === 'active' ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setScheduleToCancel(s)}
              icon={<Ban size={15} />}
              aria-label="Cancel schedule"
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Top action banner / run button */}
      <div className={styles.topBanner}>
        <div>
          <span className={styles.bannerCount}>
            Total scheduled rules: <strong>{initialSchedules.length}</strong>
          </span>
        </div>

        <Button
          variant="primary"
          icon={<Play size={16} />}
          onClick={handleRunDueNow}
          disabled={runningNow}
        >
          {runningNow ? 'Evaluating Due Schedules...' : 'Run Due Schedules Now'}
        </Button>
      </div>

      {executorNotice && (
        <div
          className={`${styles.noticeBox} ${
            executorNotice.startsWith('Error') ? styles.noticeError : styles.noticeSuccess
          }`}
        >
          <span>{executorNotice}</span>
          <button onClick={() => setExecutorNotice(null)} className={styles.noticeClose}>
            &times;
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        <div className={styles.filterSearch}>
          <Input
            placeholder="Search by customer, account, biller, reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          options={[
            { label: 'All Statuses', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Completed', value: 'completed' },
            { label: 'Cancelled', value: 'cancelled' },
          ]}
        />

        <Select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as any)}
          options={[
            { label: 'All Kinds', value: 'all' },
            { label: 'Transfers', value: 'transfer' },
            { label: 'Bill Payments', value: 'bill' },
          ]}
        />

        <Select
          value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value as any)}
          options={[
            { label: 'All Frequencies', value: 'all' },
            { label: 'One-Time', value: 'once' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Monthly', value: 'monthly' },
          ]}
        />
      </FilterBar>

      {/* Main Table */}
      <Table
        data={filteredSchedules}
        columns={columns}
        keyExtractor={(s) => s.id}
        emptyState={
          <EmptyState
            title="No scheduled payments found"
            description="No scheduled payment instructions found matching the selected filters."
          />
        }
      />

      {/* Detail Drawer with Run History */}
      <ScheduleRunsDrawer
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onCancelClick={(s) => setScheduleToCancel(s)}
      />

      {/* Cancel Confirmation Dialog with Mandatory Reason */}
      <ConfirmDialog
        isOpen={Boolean(scheduleToCancel)}
        onClose={() => setScheduleToCancel(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel Scheduled Payment"
        description={`Are you sure you want to cancel ${scheduleToCancel?.owner_name}'s scheduled ${
          scheduleToCancel?.kind === 'bill' ? 'bill payment' : 'transfer'
        } of ${scheduleToCancel ? formatCentavosToPHP(scheduleToCancel.amount) : ''}? Future runs will cease immediately.`}
        ledgerEffect="No ledger debit or credit occurs upon cancellation. Future runs are permanently halted."
        confirmText="Confirm Cancellation"
        variant="destructive"
        requireReason={true}
        reasonPlaceholder="Mandatory reason for cancelling this customer schedule (e.g., customer requested via support, suspected duplicate)..."
      />
    </div>
  );
}
