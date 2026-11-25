'use client';

import React, { useMemo, useState } from 'react';
import { toUserMessage } from '@davao-bank/shared';
import { Button, Drawer, Select, Table, Toast, type Column } from '@/components/ui';
import {
  ServiceAal2Denied,
  ServiceEmpty,
  ServiceError,
  ServiceOffline,
  ServiceSimulationNotice,
  ServiceSkeleton,
  StatusPill,
} from '@/components/services/ServiceStates';
import { useAdminServiceData } from '@/components/services/useAdminServiceData';
import {
  APPOINTMENT_SIMULATION_NOTE,
  APPOINTMENT_STATUSES,
  appointmentStatusVariant,
  displayReference,
  formatAppointmentTime,
  manilaDateKey,
  maskCustomerName,
  type AppointmentRow,
  type AppointmentStatus,
} from '@/lib/adminServices';
import { sentenceCase } from '@/lib/dashboardDisplay';
import styles from '../../components/services/Services.module.css';

function firstEditableStatus(status: AppointmentStatus): AppointmentStatus {
  return (
    APPOINTMENT_STATUSES.find((candidate) => candidate !== status) ||
    APPOINTMENT_STATUSES[0]
  );
}

export function AppointmentsClient() {
  const [branchFilter, setBranchFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const { state, reload, client } = useAdminServiceData<AppointmentRow>(
    'admin_list_appointments',
    { p_status: null }
  );

  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [nextStatus, setNextStatus] = useState<AppointmentStatus>('completed');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const branchOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        state.data
          .map((row) => row.branch_name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return [
      { value: 'all', label: 'All branches' },
      ...names.map((name) => ({ value: name, label: name })),
    ];
  }, [state.data]);

  const rows = useMemo(
    () =>
      state.data.filter((row) => {
        const matchesBranch = branchFilter === 'all' || row.branch_name === branchFilter;
        const matchesDate = !dateFilter || manilaDateKey(row.starts_at) === dateFilter;
        return matchesBranch && matchesDate;
      }),
    [branchFilter, dateFilter, state.data]
  );

  const openDetail = (row: AppointmentRow) => {
    setSelected(row);
    setNextStatus(firstEditableStatus(row.status));
    setNote('');
    setActionError(null);
    setSuccess(null);
  };

  const closeDetail = () => {
    setSelected(null);
    setActionError(null);
    setNote('');
  };

  const saveStatus = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setActionError(null);
    setSuccess(null);
    try {
      const { error } = await client.rpc('admin_update_appointment', {
        p_id: selected.id,
        p_status: nextStatus,
        p_staff_note: note.trim() || null,
      });
      if (error) {
        setActionError(toUserMessage(error, 'load'));
        return;
      }
      setSuccess('Status updated.');
      setSelected(null);
      reload();
    } catch (error) {
      setActionError(toUserMessage(error, 'load'));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<AppointmentRow>[] = [
    {
      key: 'reference',
      header: 'Appointment',
      render: (row) => (
        <>
          <button
            type="button"
            className={styles.cellButton}
            onClick={() => openDetail(row)}
            aria-label={`Change status for appointment ${displayReference(row.id)}`}
          >
            {displayReference(row.id)}
          </button>
          <div className={styles.cellMeta}>{maskCustomerName(row.user_name)}</div>
        </>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (row) => (
        <>
          <span>{row.branch_name}</span>
          <div className={styles.cellMeta}>{row.branch_area}</div>
        </>
      ),
    },
    {
      key: 'when',
      header: 'When',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">{formatAppointmentTime(row.starts_at)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <StatusPill
          label={sentenceCase(row.status)}
          variant={appointmentStatusVariant(row.status)}
        />
      ),
    },
  ];

  const statusChoices = APPOINTMENT_STATUSES.filter(
    (status) => !selected || status !== selected.status
  );

  return (
    <div className={styles.page}>
      <ServiceSimulationNotice>{APPOINTMENT_SIMULATION_NOTE}</ServiceSimulationNotice>

      {success ? (
        <Toast message={success} type="success" onClose={() => setSuccess(null)} />
      ) : null}

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <label htmlFor="appointment-branch-filter">Branch</label>
          <Select
            id="appointment-branch-filter"
            label=""
            options={branchOptions}
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="appointment-date-filter">Date</label>
          <input
            id="appointment-date-filter"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>
      </div>

      {state.status === 'loading' ? (
        <ServiceSkeleton label="Loading appointments" />
      ) : null}
      {state.status === 'denied' ? <ServiceAal2Denied /> : null}
      {state.status === 'offline' ? <ServiceOffline onRetry={reload} /> : null}
      {state.status === 'error' ? (
        <ServiceError
          message={state.error || 'Something went wrong. Try again.'}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'empty' ? (
        <ServiceEmpty
          title="No appointments"
          description="Choose another branch or date to see more appointments."
        />
      ) : null}
      {state.status === 'ready' ? (
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(row) => row.id}
          emptyState={
            <ServiceEmpty
              title="No appointments in this view"
              description="Choose another branch or date to see more appointments."
            />
          }
        />
      ) : null}

      <Drawer
        isOpen={Boolean(selected)}
        onClose={closeDetail}
        title={
          selected
            ? `Appointment ${displayReference(selected.id)}`
            : 'Appointment details'
        }
      >
        {selected ? (
          <>
            <dl className={styles.detailList}>
              <dt className={styles.detailTerm}>Reference</dt>
              <dd className={styles.detailValue}>{displayReference(selected.id)}</dd>
              <dt className={styles.detailTerm}>Customer</dt>
              <dd className={styles.detailValue}>
                {maskCustomerName(selected.user_name)}
              </dd>
              <dt className={styles.detailTerm}>Branch</dt>
              <dd className={styles.detailValue}>
                {selected.branch_name} · {selected.branch_area}
              </dd>
              <dt className={styles.detailTerm}>When</dt>
              <dd className={styles.detailValue}>
                {formatAppointmentTime(selected.starts_at)} –{' '}
                {formatAppointmentTime(selected.ends_at)}
              </dd>
              <dt className={styles.detailTerm}>Status</dt>
              <dd className={styles.detailValue}>{sentenceCase(selected.status)}</dd>
              {selected.staff_note ? (
                <>
                  <dt className={styles.detailTerm}>Staff note</dt>
                  <dd className={styles.detailValue}>{selected.staff_note}</dd>
                </>
              ) : null}
            </dl>

            {actionError ? <Toast message={actionError} type="error" /> : null}

            <div className={styles.detailForm}>
              <div>
                <label htmlFor="appointment-status">Status</label>
                <Select
                  id="appointment-status"
                  label=""
                  options={statusChoices.map((status) => ({
                    value: status,
                    label: sentenceCase(status),
                  }))}
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(event.target.value as AppointmentStatus)
                  }
                />
              </div>
              <div>
                <label htmlFor="appointment-note">Staff note (optional)</label>
                <textarea
                  id="appointment-note"
                  className={styles.noteInput}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add context for this status change"
                />
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  onClick={() => void saveStatus()}
                  disabled={saving}
                  loading={saving}
                >
                  Save status
                </Button>
                <Button type="button" variant="secondary" onClick={closeDetail}>
                  Cancel
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
