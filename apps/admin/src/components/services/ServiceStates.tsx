'use client';

import React from 'react';
import Link from 'next/link';
import { Button, EmptyState, Skeleton, type BadgeVariant } from '@/components/ui';
import { SERVICE_SIMULATION_LABEL } from '@/lib/adminServices';
import styles from './Services.module.css';

export function ServiceSimulationNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.simulationNotice}>
      <span className={styles.simulationBadge}>{SERVICE_SIMULATION_LABEL}</span>
      <span>{children}</span>
    </p>
  );
}

export function ServiceSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.statePanel} role="status" aria-label={label}>
      <span className={styles.screenReaderOnly}>{label}</span>
      <div aria-hidden="true" className={styles.skeletonList}>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className={styles.skeletonRow}>
            <Skeleton width="22%" height={18} />
            <Skeleton width="30%" height={18} />
            <Skeleton width="16%" height={18} />
            <Skeleton width="18%" height={18} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServiceEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div role="status" className={styles.statePanel}>
      <EmptyState title={title} description={description} />
    </div>
  );
}

export function ServiceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className={styles.statePanel}>
      <p>{message}</p>
      <div className={styles.actions}>
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export function ServiceOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className={styles.statePanel}>
      <p>You appear to be offline.</p>
      <div className={styles.actions}>
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export function ServiceAal2Denied() {
  return (
    <div role="alert" className={styles.statePanel}>
      <p>Two-step verification is required for staff access.</p>
      <p>
        <Link className={styles.deniedLink} href="/mfa/verify">
          Go to verification
        </Link>
      </p>
    </div>
  );
}

export function StatusPill({ label, variant }: { label: string; variant: BadgeVariant }) {
  return <span className={`${styles.statusPill} ${styles[variant]}`}>{label}</span>;
}
