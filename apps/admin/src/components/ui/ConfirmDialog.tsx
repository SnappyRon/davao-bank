'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { toUserMessage } from '@davao-bank/shared';
import { Button } from './Button';
import { Input } from './Input';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description?: string;
  ledgerEffect?: string;
  confirmText?: string;
  variant?: 'destructive' | 'warning' | 'info';
  requireReason?: boolean;
  reasonPlaceholder?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  ledgerEffect,
  confirmText = 'Confirm Action',
  variant = 'destructive',
  requireReason = true,
  reasonPlaceholder = 'Enter required mandatory justification...',
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError('Please provide a mandatory audit reason.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err: any) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const getIcon = () => {
    switch (variant) {
      case 'destructive':
        return <AlertTriangle size={24} />;
      case 'warning':
        return <AlertCircle size={24} />;
      case 'info':
      default:
        return <Info size={24} />;
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={`${styles.iconBox} ${styles[`icon-${variant}`]}`}>
            {getIcon()}
          </div>
          <div className={styles.titleBox}>
            <h3 className={styles.title}>{title}</h3>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
        </div>

        {ledgerEffect ? (
          <div className={styles.ledgerEffectBox}>
            <div className={styles.ledgerLabel}>LEDGER EFFECT</div>
            <div className={`${styles.ledgerText} tabular-nums`}>{ledgerEffect}</div>
          </div>
        ) : null}

        <div className={styles.formArea}>
          {requireReason ? (
            <Input
              label="Mandatory Reason (Audited)"
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={error}
              autoFocus
            />
          ) : error ? (
            <span className={styles.errorText}>{error}</span>
          ) : null}
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            loading={submitting}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
