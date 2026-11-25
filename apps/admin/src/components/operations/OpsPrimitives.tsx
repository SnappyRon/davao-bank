import React from 'react';
import Link from 'next/link';
import { Button, Skeleton } from '@/components/ui';
import styles from './OperationsDashboard.module.css';

interface OpsCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function OpsCard({
  title,
  description,
  action,
  className,
  children,
}: OpsCardProps) {
  const titleId = `ops-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={`${styles.card} ${className || ''}`} aria-labelledby={titleId}>
      <div className={styles.cardHeader}>
        <div>
          <h3 id={titleId} className={styles.cardTitle}>
            {title}
          </h3>
          {description ? <p className={styles.cardDescription}>{description}</p> : null}
        </div>
        {action ? <div className={styles.cardAction}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function TryAgain({
  onRetry,
  label = 'Try again',
}: {
  onRetry: () => void;
  label?: string;
}) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
      {label}
    </Button>
  );
}

export function OpsEmpty({ message }: { message: string }) {
  return (
    <div className={styles.stateBox} role="status">
      <span className={styles.stateIcon} aria-hidden="true">
        ○
      </span>
      <p>{message}</p>
    </div>
  );
}

export function OpsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.stateBox} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">
        ▲
      </span>
      <p>{message}</p>
      <TryAgain onRetry={onRetry} />
    </div>
  );
}

export function OpsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className={styles.inlineLink} href={href}>
      {children}
    </Link>
  );
}

export function LineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.lineSkeleton} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          width={`${82 - index * 12}%`}
          height={10}
          borderRadius={999}
        />
      ))}
      <svg
        className={styles.skeletonLine}
        viewBox="0 0 300 70"
        preserveAspectRatio="none"
      >
        <polyline points="0,60 55,38 110,46 165,20 220,32 300,8" />
      </svg>
    </div>
  );
}

export function BarsSkeleton({ bars = 6 }: { bars?: number }) {
  const heights = [38, 62, 46, 78, 54, 68];
  return (
    <div className={styles.barsSkeleton} aria-hidden="true">
      {heights.slice(0, bars).map((height, index) => (
        <Skeleton key={index} width={28} height={height} borderRadius={8} />
      ))}
    </div>
  );
}

export function RingSkeleton() {
  return <div className={styles.ringSkeleton} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className={styles.metricSkeleton} aria-hidden="true">
      <Skeleton width="46%" height={12} borderRadius={999} />
      <Skeleton width="72%" height={30} borderRadius={8} />
      <Skeleton width="34%" height={10} borderRadius={999} />
    </div>
  );
}
