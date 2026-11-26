/** Presentation and routing helpers for the Bantay security-case console. */
import { sentenceCase } from '@/lib/dashboardDisplay';

export type SecurityCaseStatus = 'open' | 'investigating' | 'resolved';
export type CaseFilter = SecurityCaseStatus | 'all';

export interface SecurityCaseListItem {
  id: string;
  user_id: string;
  opened_by: 'customer' | 'system' | 'staff';
  event_id: string | null;
  status: SecurityCaseStatus;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityCaseEvent {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'high';
  score: number | null;
  facts: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface SecurityCaseDetail {
  case: SecurityCaseListItem;
  events: SecurityCaseEvent[];
}

export interface CaseCustomer {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
}

export interface CaseAccount {
  account_id: string;
  user_id: string;
  account_number: string;
  status: string;
}

export const CASE_STATUSES: readonly SecurityCaseStatus[] = [
  'open',
  'investigating',
  'resolved',
];

export function isCaseStatus(value: unknown): value is SecurityCaseStatus {
  return typeof value === 'string' && CASE_STATUSES.includes(value as SecurityCaseStatus);
}

/** Opaque, reversible route segment so raw UUIDs never appear in the URL bar. */
export function caseSlug(id: string): string {
  return btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function caseIdFromSlug(slug: string): string | null {
  try {
    const padded = slug.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

export function maskCustomerName(name: string | null | undefined): string {
  const parts = (name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return parts.map((part) => `${part.charAt(0)}***`).join(' ');
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '•••';
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}•••@${domain.charAt(0)}•••`;
}

export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return '•••• ••••';
  return `•••• ${accountNumber.slice(-4)}`;
}

export function caseStatusVariant(
  status: string
): 'warning' | 'info' | 'success' | 'neutral' {
  switch (status) {
    case 'open':
      return 'warning';
    case 'investigating':
      return 'info';
    case 'resolved':
      return 'success';
    default:
      return 'neutral';
  }
}

export function eventSeverityVariant(
  severity: string
): 'danger' | 'warning' | 'info' | 'neutral' {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}

const EVENT_LABELS: Record<string, string> = {
  risky_payment_challenged: 'Payment challenge',
  risky_payment_confirmed: 'Payment confirmed',
  new_device: 'New device',
  signin_failures: 'Failed sign-ins',
  code_failures: 'Failed verification codes',
  mfa_changed: 'Two-step verification changed',
  password_changed: 'Password changed',
  limit_changed: 'Daily limit changed',
  account_locked: 'Account locked',
  account_unlocked: 'Account unlocked',
  protective_lock: 'Protective lock',
};

export function eventTitle(kind: string): string {
  return EVENT_LABELS[kind] || sentenceCase(kind);
}

/** Returns true if the case was opened by Bantay's protective lock system. */
export function isProtectiveLockCase(detail: SecurityCaseDetail): boolean {
  return detail.events.some((event) => event.kind === 'protective_lock');
}

/** Badge label for protective lock cases shown in the list and detail views. */
export const PROTECTIVE_LOCK_BADGE = 'Frozen by Bantay';

export function protectiveLockBadgeVariant(): 'danger' | 'warning' | 'info' | 'neutral' {
  return 'danger';
}

const SIGNAL_LABELS: Record<string, string> = {
  new_payee: 'New payee',
  high_vs_usual: 'Well above usual amount',
  high_amount: 'Large amount',
  rapid_payments: 'Rapid payments',
  new_device: 'New device',
  recent_auth_change: 'Recent security change',
  late_night: 'Late-night hour',
};

/** Only whitelisted signal names are rendered; raw fact payloads stay hidden. */
export function eventSignals(facts: Record<string, unknown>): string[] {
  const signals = Array.isArray(facts?.signals) ? facts.signals : [];
  return signals
    .filter((signal): signal is string => typeof signal === 'string')
    .map((signal) => SIGNAL_LABELS[signal])
    .filter((label): label is string => Boolean(label));
}

export function eventAccountId(events: SecurityCaseEvent[]): string | null {
  for (const event of events) {
    const id = event.facts?.to_account_id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return id;
  }
  return null;
}

export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
