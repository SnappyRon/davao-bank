'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toUserMessage } from '@davao-bank/shared';
import { auditEntity, auditLabel, sentenceCase } from '@/lib/dashboardDisplay';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import {
  formatCount,
  formatDateTime,
  formatTime,
  sentence,
  type OpsSummary,
  type WidgetState,
} from '@/lib/operations';
import { CardSkeleton, OpsCard, OpsEmpty, OpsError, OpsLink } from './OpsPrimitives';
import styles from './OperationsDashboard.module.css';

interface SecurityPanelProps {
  summary: WidgetState<OpsSummary>;
  onRetry: () => void;
}

export function OpsSecurityPanel({ summary, onRetry }: SecurityPanelProps) {
  const security = summary.data?.security;
  const schedules = summary.data?.schedules;
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void createAdminBrowserClient()
      .auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (!cancelled) setDenied(Boolean(error) || data?.currentLevel !== 'aal2');
      })
      .catch(() => {
        if (!cancelled) setDenied(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OpsCard
      title="Security panel"
      description="Staff-only signals from Bantay and scheduled payments"
      action={<OpsLink href="/cases">Open cases</OpsLink>}
      className={styles.panelCard}
    >
      <p className={styles.feedStatus} role="status" aria-live="polite">
        {denied ? (
          <>
            AAL2 denied — sign in again. <OpsLink href="/login">Staff sign in</OpsLink>
          </>
        ) : (
          'Verified staff session'
        )}
      </p>
      {denied ? (
        <OpsEmpty message="Live security data needs a verified staff session." />
      ) : null}
      {!denied && summary.status === 'loading' ? (
        <div className={styles.securityGrid} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}
      {!denied && summary.status === 'error' ? (
        <OpsError message="Security signals could not be loaded." onRetry={onRetry} />
      ) : null}
      {!denied &&
      (summary.status === 'empty' || (summary.status === 'ready' && !security)) ? (
        <OpsEmpty message="No security signals in this period" />
      ) : null}
      {!denied && summary.status === 'ready' && security ? (
        <div className={styles.securityGrid} aria-live="polite">
          <div className={styles.securityTile}>
            <span className={styles.securityLabel}>Open cases</span>
            <strong className={styles.securityValue}>
              {formatCount(security.open_cases)}
            </strong>
            <OpsLink href="/cases">Review cases</OpsLink>
          </div>
          <div className={styles.securityTile}>
            <span className={styles.securityLabel}>Locked accounts</span>
            <strong className={styles.securityValue}>
              {formatCount(security.locked_accounts)}
            </strong>
            <span className={styles.securityNote}>Bantay locks in effect</span>
          </div>
          <div className={styles.securityTile}>
            <span className={styles.securityLabel}>Frozen accounts</span>
            <strong className={styles.securityValue}>
              {formatCount(security.frozen_accounts)}
            </strong>
            <span className={styles.securityNote}>Accounts frozen by staff</span>
          </div>
          <div className={styles.securityTile}>
            <span className={styles.securityLabel}>Failed scheduled payments</span>
            <strong className={styles.securityValue}>
              {formatCount(schedules?.failed_runs || 0)}
            </strong>
            <span className={styles.securityNote}>
              {Object.entries(schedules?.failure_codes || {})
                .map(([reason, count]) => `${sentence(reason)} ${formatCount(count)}`)
                .join(' · ') || 'No failure reasons recorded'}
            </span>
          </div>
          <div className={styles.securityTile}>
            <span className={styles.securityLabel}>Failed sign-ins</span>
            <strong className={styles.securityValue}>
              {security.signin_failures === null || security.signin_failures === undefined
                ? 'Not available'
                : formatCount(security.signin_failures)}
            </strong>
            <span className={styles.securityNote}>
              {security.signin_failures === null || security.signin_failures === undefined
                ? security.signin_failures_note || 'No reliable source'
                : 'From staff analytics'}
            </span>
          </div>
        </div>
      ) : null}
    </OpsCard>
  );
}

interface AuditRow {
  id: string;
  actor_role: string | null;
  action: string;
  entity: string | null;
  created_at: string;
}

export function OpsRecentActivity() {
  const supabase = useMemo(() => createAdminBrowserClient(), []);
  const [state, setState] = useState<WidgetState<AuditRow[]>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, actor_role, action, entity, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (!mounted.current) return;
    if (error) {
      setState({
        status: 'error',
        data: null,
        error: toUserMessage(error, 'load'),
      });
      return;
    }
    const rows = (Array.isArray(data) ? data : []) as AuditRow[];
    setState({ status: rows.length ? 'ready' : 'empty', data: rows, error: null });
  }, [supabase]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const rows = state.data || [];

  return (
    <OpsCard
      title="Recent admin activity"
      description="Newest audited staff actions"
      action={<OpsLink href="/audit">View all</OpsLink>}
      className={styles.panelCard}
    >
      {state.status === 'loading' ? (
        <div className={styles.activitySkeleton} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={styles.activitySkeletonRow} />
          ))}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <OpsError
          message={state.error || 'Activity could not be loaded.'}
          onRetry={() => void load()}
        />
      ) : null}
      {state.status === 'empty' ? (
        <OpsEmpty message="No staff activity recorded yet" />
      ) : null}
      {state.status === 'ready' ? (
        <table className={styles.dataTable}>
          <caption>Recent admin activity, text version</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="tabular-nums" title={formatDateTime(row.created_at)}>
                  {formatTime(row.created_at)}
                </td>
                <td>{sentenceCase(row.actor_role || 'system')}</td>
                <td>{auditLabel(row.action)}</td>
                <td>{auditEntity(row.entity || 'general')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className={styles.visuallyHidden} aria-live="polite">
        {state.status === 'ready' ? `${rows.length} recent staff actions shown.` : ''}
      </p>
    </OpsCard>
  );
}
