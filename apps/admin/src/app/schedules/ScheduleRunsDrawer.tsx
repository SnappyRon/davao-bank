'use client';

import React from 'react';
import { Ban, CheckCircle2, XCircle } from 'lucide-react';
import { formatCentavosToPHP } from '@davao-bank/shared';
import { Drawer, Card, Badge, Button, EmptyState } from '@/components/ui';
import type { AdminScheduleRow } from './types';
import styles from './Schedules.module.css';

interface ScheduleRunsDrawerProps {
  schedule: AdminScheduleRow | null;
  onClose: () => void;
  onCancelClick: (s: AdminScheduleRow) => void;
}

export function ScheduleRunsDrawer({
  schedule,
  onClose,
  onCancelClick,
}: ScheduleRunsDrawerProps) {
  if (!schedule) return null;

  return (
    <Drawer
      isOpen={Boolean(schedule)}
      onClose={onClose}
      title={
        schedule.kind === 'bill'
          ? `Bill Schedule: ${schedule.biller_name}`
          : 'Scheduled Transfer Details'
      }
    >
      <div className={styles.drawerStack}>
        <Card title="Instruction Parameters">
          <div className={styles.paramGrid}>
            <div>
              <span className={styles.paramLabel}>Customer</span>
              <strong>{schedule.owner_name}</strong>
              {schedule.owner_phone ? (
                <div className={styles.destSub}>{schedule.owner_phone}</div>
              ) : null}
            </div>

            <div>
              <span className={styles.paramLabel}>Amount</span>
              <strong className={styles.paramAmount}>
                {formatCentavosToPHP(schedule.amount)}
              </strong>
            </div>

            <div>
              <span className={styles.paramLabel}>From Account</span>
              <span className={styles.paramMono}>{schedule.from_account_number}</span>
            </div>

            <div>
              <span className={styles.paramLabel}>Destination</span>
              {schedule.kind === 'bill' ? (
                <span>
                  {schedule.biller_name} &bull; Ref: {schedule.biller_reference}
                </span>
              ) : (
                <span className={styles.paramMono}>
                  {schedule.to_account_number || '—'}
                </span>
              )}
            </div>

            <div>
              <span className={styles.paramLabel}>Recurrence</span>
              <span className={styles.paramCapitalize}>{schedule.frequency}</span>
              <span className={styles.destSub}>
                {' '}
                (Runs: {schedule.runs_done}
                {schedule.max_runs ? ` / ${schedule.max_runs}` : ''})
              </span>
            </div>

            <div>
              <span className={styles.paramLabel}>Next Run Date</span>
              <strong>
                {schedule.status === 'active'
                  ? schedule.next_run_date
                  : 'Completed / Cancelled'}
              </strong>
            </div>

            <div>
              <span className={styles.paramLabel}>Status</span>
              <span className={styles.paramCapitalize}>{schedule.status}</span>
            </div>

            <div>
              <span className={styles.paramLabel}>Created On</span>
              <span>{new Date(schedule.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {schedule.note && (
            <div className={styles.noteSection}>
              <span className={styles.paramLabel}>Note</span>
              <span>{schedule.note}</span>
            </div>
          )}
        </Card>

        {/* Run History List */}
        <Card title={`Execution Runs (${schedule.runs.length})`}>
          {schedule.runs.length === 0 ? (
            <EmptyState
              title="No execution runs recorded yet"
              description="When this scheduled instruction triggers, each execution attempt will appear here."
            />
          ) : (
            <div className={styles.runsList}>
              {schedule.runs.map((run) => (
                <div
                  key={run.id}
                  className={`${styles.runItem} ${
                    run.status === 'completed' ? styles.runCompleted : styles.runFailed
                  }`}
                >
                  <div className={styles.runLeft}>
                    {run.status === 'completed' ? (
                      <CheckCircle2 size={16} className={styles.iconSuccess} />
                    ) : (
                      <XCircle size={16} className={styles.iconError} />
                    )}
                    <div>
                      <div className={styles.runDate}>Run Date: {run.run_date}</div>
                      {run.transaction_id ? (
                        <div className={styles.runTx}>Tx: {run.transaction_id}</div>
                      ) : null}
                      {run.failure_reason ? (
                        <div className={styles.runFailReason}>
                          Failed: {run.failure_reason}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.runRight}>
                    <Badge
                      label={run.status}
                      variant={run.status === 'completed' ? 'success' : 'danger'}
                    />
                    <div className={styles.runTime}>
                      {new Date(run.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {schedule.status === 'active' && (
          <Button
            variant="destructive"
            icon={<Ban size={16} />}
            onClick={() => onCancelClick(schedule)}
          >
            Cancel This Scheduled Payment
          </Button>
        )}
      </div>
    </Drawer>
  );
}
