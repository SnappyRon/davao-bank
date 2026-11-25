'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatReferenceId } from '@davao-bank/shared';
import { sentenceCase } from '@/lib/dashboardDisplay';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Select,
  StatusBadge,
  Toast,
} from '@/components/ui';
import {
  setCaseAccountStatusAction,
  unlockSecurityCaseUserAction,
  updateSecurityCaseAction,
} from '../../actions';
import {
  CASE_STATUSES,
  caseStatusVariant,
  eventSeverityVariant,
  eventSignals,
  eventTitle,
  formatEventTime,
  isCaseStatus,
  maskAccountNumber,
  maskCustomerName,
  maskEmail,
  type CaseAccount,
  type CaseCustomer,
  type SecurityCaseDetail,
  type SecurityCaseStatus,
} from '@/lib/securityCases';
import styles from '../Cases.module.css';

interface CaseDetailClientProps {
  detail: SecurityCaseDetail;
  customer: CaseCustomer | null;
  receivingAccount: CaseAccount | null;
}

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

type ActionResult = { success: boolean; data?: unknown; error?: string };

const STATUS_OPTIONS = CASE_STATUSES.map((status) => ({
  value: status,
  label: sentenceCase(status),
}));

export function CaseDetailClient({
  detail,
  customer,
  receivingAccount,
}: CaseDetailClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityCaseStatus>(detail.case.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [accountAction, setAccountAction] = useState<'frozen' | 'active' | null>(null);

  const applyResult = (result: ActionResult, successMessage: string) => {
    if (!result.success) {
      setFeedback({
        type: 'error',
        message: result.error || 'That action could not be completed.',
      });
      return;
    }
    setFeedback({ type: 'success', message: successMessage });
    router.refresh();
  };

  const saveUpdate = async () => {
    setBusy(true);
    try {
      const result = await updateSecurityCaseAction(detail.case.id, status, note);
      if (result.success) setNote('');
      applyResult(result, 'Case updated.');
    } finally {
      setBusy(false);
    }
  };

  const accountNextStatus: 'frozen' | 'active' | null =
    accountAction || (receivingAccount?.status === 'active' ? 'frozen' : null);

  return (
    <>
      {feedback ? (
        <Toast
          message={feedback.message}
          type={feedback.type}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <Card>
            <h2 className={styles.cardTitle}>Customer summary</h2>
            <dl className={styles.summaryList}>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Customer</dt>
                <dd className={styles.summaryValue}>
                  {maskCustomerName(customer?.full_name)}
                </dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Contact</dt>
                <dd className={styles.summaryValue}>{maskEmail(customer?.email)}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Profile status</dt>
                <dd className={styles.summaryValue}>
                  <StatusBadge status={customer?.status || 'active'} />
                </dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Case reference</dt>
                <dd className={styles.summaryValue}>
                  {formatReferenceId(detail.case.id)}
                </dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Opened by</dt>
                <dd className={styles.summaryValue}>
                  {sentenceCase(detail.case.opened_by)}
                </dd>
              </div>
              <div className={styles.summaryRow}>
                <dt className={styles.summaryTerm}>Current status</dt>
                <dd className={styles.summaryValue}>
                  <Badge
                    label={sentenceCase(detail.case.status)}
                    variant={caseStatusVariant(detail.case.status)}
                  />
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Update case</h2>
            <div className={styles.actionStack}>
              <Select
                label="Case status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isCaseStatus(next)) setStatus(next);
                }}
              />
              <label className={styles.summaryTerm} htmlFor="case-staff-note">
                Staff note
              </label>
              <textarea
                id="case-staff-note"
                aria-label="Staff note"
                className={styles.noteInput}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did the review find?"
              />
              <Button onClick={saveUpdate} disabled={busy}>
                Save case update
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Customer account</h2>
            {receivingAccount ? (
              <>
                <p className={styles.summaryValue}>
                  Receiving account {maskAccountNumber(receivingAccount.account_number)}
                </p>
                <div className={styles.actionRow}>
                  <StatusBadge status={receivingAccount.status} />
                  <Button
                    variant="secondary"
                    onClick={() => setAccountAction('active')}
                    disabled={receivingAccount.status !== 'frozen' || busy}
                  >
                    Unfreeze account
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setAccountAction('frozen')}
                    disabled={receivingAccount.status !== 'active' || busy}
                  >
                    Freeze account
                  </Button>
                </div>
              </>
            ) : (
              <p className={styles.mutedText}>
                No receiving account was recorded for this case.
              </p>
            )}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Customer lock</h2>
            <p className={styles.mutedText}>
              Release a Bantay lock only after verifying the customer. This calls the
              staff unlock RPC; the one-hour self-service wait is never shortened.
            </p>
            <Button
              variant="destructive"
              onClick={() => setUnlockOpen(true)}
              disabled={busy}
            >
              Unlock customer
            </Button>
          </Card>
        </div>

        <Card>
          <h2 className={styles.cardTitle}>Event timeline</h2>
          {detail.events.length === 0 ? (
            <p className={styles.mutedText}>No events are linked to this case.</p>
          ) : (
            <ul className={styles.timeline}>
              {detail.events.map((event) => {
                const signals = eventSignals(event.facts);
                return (
                  <li key={event.id} className={styles.timelineItem}>
                    <div className={styles.timelineTop}>
                      <div className={styles.timelineBadges}>
                        <Badge label={eventTitle(event.kind)} variant="neutral" />
                        <Badge
                          label={sentenceCase(event.severity)}
                          variant={eventSeverityVariant(event.severity)}
                        />
                      </div>
                      <time className={styles.timelineTime} dateTime={event.created_at}>
                        {formatEventTime(event.created_at)}
                      </time>
                    </div>
                    <p className={styles.timelineSignals}>
                      Risk score: {event.score ?? 'not scored'} · Status:{' '}
                      {sentenceCase(event.status)}
                    </p>
                    <p className={styles.timelineSignals}>
                      {signals.length ? signals.join(' · ') : 'No additional signals.'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        isOpen={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        title="Unlock customer"
        description="The customer will be able to send money again immediately."
        confirmText="Unlock customer"
        onConfirm={(reason) => {
          setUnlockOpen(false);
          setBusy(true);
          void unlockSecurityCaseUserAction(detail.case.user_id, detail.case.id, reason)
            .then((result) => applyResult(result, 'Customer unlocked.'))
            .finally(() => setBusy(false));
        }}
      />

      <ConfirmDialog
        isOpen={accountAction !== null}
        onClose={() => setAccountAction(null)}
        title={accountAction === 'active' ? 'Unfreeze account' : 'Freeze account'}
        description="The case reference is recorded in the audit log."
        confirmText={accountAction === 'active' ? 'Unfreeze account' : 'Freeze account'}
        onConfirm={(reason) => {
          const nextStatus = accountNextStatus;
          setAccountAction(null);
          if (!nextStatus || !receivingAccount) return;
          setBusy(true);
          void setCaseAccountStatusAction(
            receivingAccount.account_id,
            nextStatus,
            reason,
            detail.case.id
          )
            .then((result) =>
              applyResult(
                result,
                nextStatus === 'frozen'
                  ? 'Receiving account frozen.'
                  : 'Receiving account unfrozen.'
              )
            )
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
