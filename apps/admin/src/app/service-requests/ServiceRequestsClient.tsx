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
  SERVICE_REQUEST_SIMULATION_NOTE,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_UPDATE_STATUSES,
  describeRequestDetails,
  displayReference,
  formatTimestamp,
  isServiceRequestStatus,
  isServiceRequestType,
  maskCustomerId,
  serviceRequestStatusVariant,
  serviceRequestTypeLabel,
  type ServiceRequestRow,
  type ServiceRequestStatus,
} from '@/lib/adminServices';
import { sentenceCase } from '@/lib/dashboardDisplay';
import styles from '../../components/services/Services.module.css';

interface ServiceRequestsClientProps {
  initialStatus?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...SERVICE_REQUEST_STATUSES.map((status) => ({
    value: status,
    label: sentenceCase(status),
  })),
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...SERVICE_REQUEST_TYPES.map((type) => ({
    value: type,
    label: serviceRequestTypeLabel(type),
  })),
];

function firstEditableStatus(status: ServiceRequestStatus): ServiceRequestStatus {
  return (
    SERVICE_REQUEST_UPDATE_STATUSES.find((candidate) => candidate !== status) ||
    SERVICE_REQUEST_UPDATE_STATUSES[0]
  );
}

export function ServiceRequestsClient({ initialStatus }: ServiceRequestsClientProps) {
  const [statusFilter, setStatusFilter] = useState(
    initialStatus && isServiceRequestStatus(initialStatus) ? initialStatus : 'all'
  );
  const [typeFilter, setTypeFilter] = useState('all');
  const { state, reload, client } = useAdminServiceData<ServiceRequestRow>(
    'admin_list_service_requests',
    { p_status: statusFilter === 'all' ? null : statusFilter }
  );

  const [selected, setSelected] = useState<ServiceRequestRow | null>(null);
  const [nextStatus, setNextStatus] = useState<ServiceRequestStatus>('in_review');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.data.filter(
        (row) =>
          typeFilter === 'all' ||
          (isServiceRequestType(row.type) && row.type === typeFilter)
      ),
    [state.data, typeFilter]
  );

  const openDetail = (row: ServiceRequestRow) => {
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
    if (!selected || saving || !note.trim()) return;
    setSaving(true);
    setActionError(null);
    setSuccess(null);
    try {
      const { error } = await client.rpc('admin_update_service_request', {
        p_id: selected.id,
        p_status: nextStatus,
        p_note: note.trim(),
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

  const columns: Column<ServiceRequestRow>[] = [
    {
      key: 'reference',
      header: 'Request',
      render: (row) => (
        <>
          <button
            type="button"
            className={styles.cellButton}
            onClick={() => openDetail(row)}
            aria-label={`Open details for request ${row.reference}`}
          >
            {displayReference(row.reference)}
          </button>
          <div className={styles.cellMeta}>{serviceRequestTypeLabel(row.type)}</div>
        </>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span>{maskCustomerId(row.user_id)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill
          label={sentenceCase(row.status)}
          variant={serviceRequestStatusVariant(row.status)}
        />
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">{formatTimestamp(row.created_at)}</span>
      ),
    },
  ];

  const detailLines = selected
    ? [
        { label: 'Reference', value: displayReference(selected.reference) },
        { label: 'Type', value: serviceRequestTypeLabel(selected.type) },
        { label: 'Status', value: sentenceCase(selected.status) },
        { label: 'Customer', value: maskCustomerId(selected.user_id) },
        { label: 'Submitted', value: formatTimestamp(selected.created_at) },
        { label: 'Updated', value: formatTimestamp(selected.updated_at) },
        ...describeRequestDetails(selected.type, selected.details),
      ]
    : [];

  const statusChoices = SERVICE_REQUEST_UPDATE_STATUSES.filter(
    (status) => !selected || status !== selected.status
  );

  return (
    <div className={styles.page}>
      <ServiceSimulationNotice>{SERVICE_REQUEST_SIMULATION_NOTE}</ServiceSimulationNotice>

      {success ? (
        <Toast message={success} type="success" onClose={() => setSuccess(null)} />
      ) : null}

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <label htmlFor="service-request-status-filter">Status</label>
          <Select
            id="service-request-status-filter"
            label=""
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="service-request-type-filter">Type</label>
          <Select
            id="service-request-type-filter"
            label=""
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          />
        </div>
      </div>

      {state.status === 'loading' ? (
        <ServiceSkeleton label="Loading service requests" />
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
          title="No service requests"
          description="Choose another status or type to see more requests."
        />
      ) : null}
      {state.status === 'ready' ? (
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(row) => row.id}
          emptyState={
            <ServiceEmpty
              title="No requests in this view"
              description="Choose another type to see more requests."
            />
          }
        />
      ) : null}

      <Drawer
        isOpen={Boolean(selected)}
        onClose={closeDetail}
        title={
          selected ? `Request ${displayReference(selected.reference)}` : 'Request details'
        }
      >
        {selected ? (
          <>
            <dl className={styles.detailList}>
              {detailLines.map((line) => (
                <React.Fragment key={line.label}>
                  <dt className={styles.detailTerm}>{line.label}</dt>
                  <dd className={styles.detailValue}>{line.value}</dd>
                </React.Fragment>
              ))}
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
                <label htmlFor="service-request-status">Status</label>
                <Select
                  id="service-request-status"
                  label=""
                  options={statusChoices.map((status) => ({
                    value: status,
                    label: sentenceCase(status),
                  }))}
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(event.target.value as ServiceRequestStatus)
                  }
                />
              </div>
              <div>
                <label htmlFor="service-request-note">Staff note</label>
                <textarea
                  id="service-request-note"
                  className={styles.noteInput}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a short note for this status change"
                />
                <span className={styles.noteHint}>A note is required before saving.</span>
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  onClick={() => void saveStatus()}
                  disabled={!note.trim() || saving}
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
