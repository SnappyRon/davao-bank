import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ label, variant = 'neutral', className }: BadgeProps) {
  const classNames = [styles.badge, styles[variant], className || '']
    .filter(Boolean)
    .join(' ');

  return <span className={classNames}>{label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case 'active':
    case 'completed':
      return <Badge label={status} variant="success" />;
    case 'suspended':
    case 'closed':
    case 'failed':
    case 'reversed':
      return <Badge label={status} variant="danger" />;
    case 'frozen':
    case 'pending':
    case 'needs_attention':
      return (
        <Badge
          label={status === 'needs_attention' ? 'Needs Attention' : status}
          variant="warning"
        />
      );
    case 'admin':
      return <Badge label={status} variant="info" />;
    default:
      return <Badge label={status} variant="neutral" />;
  }
}
