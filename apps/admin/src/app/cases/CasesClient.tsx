'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatReferenceId } from '@davao-bank/shared';
import { sentenceCase } from '@/lib/dashboardDisplay';
import {
  Badge,
  EmptyState,
  FilterBar,
  Select,
  Table,
  Toast,
  type Column,
} from '@/components/ui';
import {
  caseSlug,
  caseStatusVariant,
  formatEventTime,
  PROTECTIVE_LOCK_BADGE,
  protectiveLockBadgeVariant,
  type CaseFilter,
  type SecurityCaseListItem,
} from '@/lib/securityCases';
import styles from './Cases.module.css';

interface CasesClientProps {
  initialCases: SecurityCaseListItem[];
  status: CaseFilter;
  loadError: string | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
];

function isProtectiveLock(item: SecurityCaseListItem): boolean {
  return item.opened_by === 'system';
}

export function CasesClient({ initialCases, status, loadError }: CasesClientProps) {
  const router = useRouter();
  const cases = useMemo(() => initialCases, [initialCases]);

  const columns: Column<SecurityCaseListItem>[] = [
    {
      key: 'reference',
      header: 'Case',
      render: (item) => (
        <>
          <Link className={styles.referenceLink} href={`/cases/${caseSlug(item.id)}`}>
            {formatReferenceId(item.id)}
          </Link>
          <div className={styles.cellMeta}>Opened {sentenceCase(item.opened_by)}</div>
          {isProtectiveLock(item) && (
            <Badge
              label={PROTECTIVE_LOCK_BADGE}
              variant={protectiveLockBadgeVariant()}
              className={styles.protectiveBadge}
            />
          )}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <Badge
          label={sentenceCase(item.status)}
          variant={caseStatusVariant(item.status)}
        />
      ),
    },
    {
      key: 'updated',
      header: 'Last updated',
      align: 'right',
      render: (item) => (
        <span className="tabular-nums">{formatEventTime(item.updated_at)}</span>
      ),
    },
  ];

  if (loadError) {
    return (
      <>
        <Toast message={loadError} type="error" />
        <EmptyState
          title="No cases to review"
          description="Security cases appear here after a customer reports suspicious activity."
        />
      </>
    );
  }

  return (
    <>
      <FilterBar className={styles.filterBar}>
        <Select
          className={styles.statusFilter}
          label="Filter cases by status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(event) => {
            const next = event.target.value;
            router.push(next === 'all' ? '/cases' : `/cases?status=${next}`);
          }}
        />
      </FilterBar>
      <Table
        columns={columns}
        data={cases}
        keyExtractor={(item) => item.id}
        emptyState={
          <EmptyState
            title="No cases in this view"
            description="Choose another status to see cases that need staff attention."
          />
        }
      />
    </>
  );
}
