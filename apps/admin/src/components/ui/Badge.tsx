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

  const label = normalized.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  switch (normalized) {
    case 'active':
    case 'completed':
      return <Badge label={label} variant="success" />;
    case 'suspended':
    case 'closed':
    case 'failed':
      return <Badge label={label} variant="danger" />;
    case 'frozen':
    case 'pending':
    case 'needs_attention':
      return <Badge label={label} variant="warning" />;
    case 'scheduled':
    case 'admin':
      return <Badge label={label} variant="info" />;
    default:
      return <Badge label={label} variant="neutral" />;
  }
}
