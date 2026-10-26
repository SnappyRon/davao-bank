'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  Play,
  Eye,
  Ban,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Zap,
} from 'lucide-react';
import {
  formatCentavosToPHP,
  type ScheduledPaymentKind,
  type ScheduledPaymentFrequency,
  type ScheduledPaymentStatus,
} from '@davao-bank/shared';
import {
  adminRunDueSchedulesAction,
  adminCancelScheduleAction,
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
  EmptyState,
} from '@/components/ui';

export interface AdminScheduleRunItem {
  id: string;
  schedule_id: string;
  run_date: string;
  status: 'completed' | 'failed';
  transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface AdminScheduleRow {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
  from_account: string;
  from_account_number: string;
  kind: ScheduledPaymentKind;
  to_account: string | null;
  to_account_number: string | null;
  biller_id: string | null;
  biller_name: string | null;
  biller_reference: string | null;
  amount: number;
  note: string | null;
  frequency: ScheduledPaymentFrequency;
  start_date: string;
  end_date: string | null;
  max_runs: number | null;
  runs_done: number;
  next_run_date: string;
  status: ScheduledPaymentStatus;
  created_at: string;
  updated_at: string;
  runs: AdminScheduleRunItem[];
}

interface SchedulesClientProps {
  initialSchedules: AdminScheduleRow[];
}

export function SchedulesClient({ initialSchedules }: SchedulesClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScheduledPaymentStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | ScheduledPaymentKind>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | ScheduledPaymentFrequency>('all');

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
        const msg = d?.message || `Evaluated ${d?.processed ?? 0} schedule(s): ${d?.succeeded ?? 0} succeeded, ${d?.failed ?? 0} failed.`;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          <div style={{ fontWeight: 600 }}>{s.owner_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
            From: {s.from_account_number}
          </div>
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
              <div style={{ fontWeight: 600 }}>{s.biller_name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Ref: {s.biller_reference}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>Account Transfer</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                To: {s.to_account_number || '—'}
              </div>
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
        <span style={{ fontWeight: 700 }} className="tabular-nums">
          {formatCentavosToPHP(s.amount)}
        </span>
      ),
    },
    {
      key: 'timing',
      header: 'Schedule / Runs',
      render: (s: AdminScheduleRow) => (
        <div>
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
            {s.frequency}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Next: {s.status === 'active' ? s.next_run_date : '—'} &bull; Runs: {s.runs_done}
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
        if (s.status === 'completed') return <Badge label="Completed" variant="neutral" />;
        return <Badge label="Cancelled" variant="danger" />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (s: AdminScheduleRow) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: executorNotice.startsWith('Error')
              ? 'var(--color-error-bg, #fde8e8)'
              : 'var(--color-success-bg, #e6f9ed)',
            border: `1px solid ${
              executorNotice.startsWith('Error')
                ? 'var(--color-error-border, #f98080)'
                : 'var(--color-success-border, #31c48d)'
            }`,
            color: 'var(--color-ink)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{executorNotice}</span>
          <button
            onClick={() => setExecutorNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              marginLeft: '1rem',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        <div style={{ flex: 1, minWidth: '220px' }}>
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
      <Drawer
        isOpen={Boolean(selectedSchedule)}
        onClose={() => setSelectedSchedule(null)}
        title={
          selectedSchedule?.kind === 'bill'
            ? `Bill Schedule: ${selectedSchedule?.biller_name}`
            : 'Scheduled Transfer Details'
        }
      >
        {selectedSchedule && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Card title="Instruction Parameters">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    CUSTOMER
                  </span>
                  <strong>{selectedSchedule.owner_name}</strong>
                  {selectedSchedule.owner_phone ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {selectedSchedule.owner_phone}
                    </div>
                  ) : null}
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    AMOUNT
                  </span>
                  <strong style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
                    {formatCentavosToPHP(selectedSchedule.amount)}
                  </strong>
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    FROM ACCOUNT
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>{selectedSchedule.from_account_number}</span>
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    DESTINATION
                  </span>
                  {selectedSchedule.kind === 'bill' ? (
                    <span>
                      {selectedSchedule.biller_name} &bull; Ref: {selectedSchedule.biller_reference}
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'monospace' }}>
                      {selectedSchedule.to_account_number || '—'}
                    </span>
                  )}
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    RECURRENCE
                  </span>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                    {selectedSchedule.frequency}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    {' '}(Runs: {selectedSchedule.runs_done}{selectedSchedule.max_runs ? ` / ${selectedSchedule.max_runs}` : ''})
                  </span>
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    NEXT RUN DATE
                  </span>
                  <strong>{selectedSchedule.status === 'active' ? selectedSchedule.next_run_date : 'Completed / Cancelled'}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    STATUS
                  </span>
                  <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>
                    {selectedSchedule.status}
                  </span>
                </div>

                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    CREATED ON
                  </span>
                  <span>{new Date(selectedSchedule.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {selectedSchedule.note && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                    NOTE
                  </span>
                  <span>{selectedSchedule.note}</span>
                </div>
              )}
            </Card>

            {/* Run History List */}
            <Card title={`Execution Runs (${selectedSchedule.runs.length})`}>
              {selectedSchedule.runs.length === 0 ? (
                <EmptyState
                  title="No execution runs recorded yet"
                  description="When this scheduled instruction triggers, each execution attempt will appear here."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedSchedule.runs.map((run) => (
                    <div
                      key={run.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor:
                          run.status === 'completed'
                            ? 'rgba(46, 125, 50, 0.05)'
                            : 'rgba(211, 47, 47, 0.05)',
                        border: `1px solid ${
                          run.status === 'completed'
                            ? 'rgba(46, 125, 50, 0.2)'
                            : 'rgba(211, 47, 47, 0.2)'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {run.status === 'completed' ? (
                          <CheckCircle2 size={16} color="var(--color-success, #2e7d32)" />
                        ) : (
                          <XCircle size={16} color="var(--color-error, #d32f2f)" />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            Run Date: {run.run_date}
                          </div>
                          {run.transaction_id ? (
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                              Tx: {run.transaction_id}
                            </div>
                          ) : null}
                          {run.failure_reason ? (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-error, #d32f2f)' }}>
                              Failed: {run.failure_reason}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <Badge
                          label={run.status}
                          variant={run.status === 'completed' ? 'success' : 'danger'}
                        />
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {selectedSchedule.status === 'active' && (
              <Button
                variant="destructive"
                icon={<Ban size={16} />}
                onClick={() => {
                  setScheduleToCancel(selectedSchedule);
                }}
              >
                Cancel This Scheduled Payment
              </Button>
            )}
          </div>
        )}
      </Drawer>

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
