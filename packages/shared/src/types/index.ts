/**
 * Shared Type Definitions for Davao Bank
 * Phase 1, 2 & 3: Design System, Database Entities, Auth & Core Banking
 */

// --- Connectivity Scaffold ---
export interface HealthCheck {
  id: number;
  status: string;
  checked_at: string;
}

export type HealthCheckStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface HealthCheckState {
  status: HealthCheckStatus;
  message: string;
  checkedAt?: string;
}

// --- User Roles & Profile ---
export type UserRole = 'customer' | 'admin' | 'system';
export type ProfileStatus = 'active' | 'suspended';

export interface Profile {
  id: string; // uuid references auth.users(id)
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  status: ProfileStatus;
  created_at: string;
}

// --- Accounts ---
export type AccountType = 'savings' | 'checking';
export type AccountStatus = 'active' | 'frozen' | 'closed';

export interface Account {
  id: string; // uuid pk
  account_number: string;
  user_id: string;
  type: AccountType;
  currency: string;
  status: AccountStatus;
  created_at: string;
}

// --- Transactions & Ledger ---
export type TransactionType =
  | 'transfer'
  | 'deposit'
  | 'withdrawal'
  | 'adjustment'
  | 'reversal'
  | 'bill_payment';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  initiated_by: string | null;
  idempotency_key: string | null;
  reference: string | null;
  created_at: string;
}

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerEntry {
  id: string;
  account_id: string;
  transaction_id: string;
  direction: LedgerDirection;
  amount: number; // integer minor units (centavos)
  created_at: string;
}

export interface Transfer {
  id: string;
  transaction_id: string;
  from_account: string;
  to_account: string;
  amount: number; // integer minor units (centavos)
}

// --- Audit & Notifications ---
export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

// --- Balance Read-Model ---
export interface AccountBalance {
  account_id: string;
  user_id: string;
  account_number: string;
  type: AccountType;
  currency: string;
  status: AccountStatus;
  balance: number; // centavos
  ledger_entry_count: number;
  last_activity_at: string | null;
}

// --- Phase 3 Core Banking Types ---

export interface TransactionHistoryItem {
  ledger_entry_id: string;
  transaction_id: string;
  account_id: string;
  account_number: string;
  type: TransactionType;
  direction: LedgerDirection;
  amount: number; // positive centavos
  signed_amount: number; // positive for credit, negative for debit
  status: TransactionStatus;
  reference: string | null;
  counterparty_account_number: string | null;
  created_at: string;
}

export interface TransferParams {
  from_account: string;
  to_account?: string;
  to_account_number?: string;
  amount: number; // centavos
  idempotency_key: string;
  reference?: string;
}

export interface DepositParams {
  account: string;
  amount: number; // centavos
  idempotency_key: string;
  reference?: string;
}

export interface WithdrawParams {
  account: string;
  amount: number; // centavos
  idempotency_key: string;
  reference?: string;
}

export interface MoneyOperationResult {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  from_account?: string;
  to_account?: string;
  account_number?: string;
  reference: string;
  idempotency_key: string;
  created_at: string;
  idempotent_replay: boolean;
}

// --- Currency & Idempotency Utilities ---

/**
 * Formats integer centavos to Philippine Peso (PHP) currency string.
 * Example: 5000000 -> ₱50,000.00
 */
export function formatCentavosToPHP(centavos: number): string {
  const isNegative = centavos < 0;
  const abs = Math.abs(centavos) / 100;
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}₱${formatted}`;
}

/**
 * Converts user decimal input string or number to integer centavos.
 * Example: "50000" or "50000.50" -> 5000050
 */
export function phpToCentavos(amount: number | string): number {
  if (typeof amount === 'string') {
    const clean = amount.replace(/[₱,\s]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }
  return Math.round(amount * 100);
}

/**
 * Generates a unique client idempotency key for money operations.
 */
export function generateIdempotencyKey(operation: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${operation}_${timestamp}_${random}`;
}

// --- Phase 4: Admin Management Types ---

export interface AdminDashboardStats {
  total_users: number;
  active_users: number;
  suspended_users: number;
  total_accounts: number;
  active_accounts: number;
  frozen_accounts: number;
  total_system_balance: number; // centavos
  total_transactions: number;
  completed_transactions: number;
  reversed_transactions: number;
  total_volume: number; // centavos
  recent_30d_transactions: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  email_confirmed: boolean;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  status: ProfileStatus;
  created_at: string;
}

export interface AdminSetUserStatusParams {
  userId: string;
  status: ProfileStatus;
  reason: string;
}

export interface AdminOpenAccountParams {
  userId: string;
  type?: AccountType;
  currency?: string;
}

export interface AdminSetAccountStatusParams {
  accountId: string;
  status: AccountStatus;
  reason: string;
}

export interface AdminAdjustBalanceParams {
  accountId: string;
  amount: number; // centavos
  direction: LedgerDirection;
  reason: string;
  idempotencyKey: string;
}

export interface AdminReverseTransactionParams {
  transactionId: string;
  reason: string;
  idempotencyKey: string;
}

export interface AdminOperationResult {
  success: boolean;
  id?: string;
  message?: string;
  [key: string]: unknown;
}

// --- Phase 5 Stage B: Everyday Extras Types ---

export interface SavedRecipient {
  id: string;
  owner_id: string;
  account_number: string;
  nickname: string;
  created_at: string;
}

export interface StatementTransactionItem {
  id: string;
  transaction_id: string;
  account_id: string;
  account_number: string;
  type: TransactionType;
  direction: LedgerDirection;
  amount: number;
  signed_amount: number;
  status: TransactionStatus;
  reference: string | null;
  counterparty_account_number: string | null;
  created_at: string;
}

export interface AccountStatement {
  account_id: string;
  account_number: string;
  period_from: string;
  period_to: string;
  opening_balance: number;
  closing_balance: number;
  transactions: StatementTransactionItem[];
}

// --- Phase 5 Stage C: Scheduled Payments & Bill Pay Types ---

export type BillerCategory = 'electricity' | 'water' | 'internet' | 'mobile' | 'other';

export interface Biller {
  id: string;
  name: string;
  category: BillerCategory;
  account_id: string;
  reference_label: string;
  reference_pattern: string;
  is_active: boolean;
  created_at: string;
}

export interface BillPayment {
  id: string;
  transaction_id: string;
  biller_id: string;
  payer_account: string;
  biller_reference: string;
  created_at: string;
}

export type ScheduledPaymentKind = 'transfer' | 'bill';
export type ScheduledPaymentFrequency = 'once' | 'weekly' | 'monthly';
export type ScheduledPaymentStatus = 'active' | 'completed' | 'cancelled';

export interface ScheduledPayment {
  id: string;
  owner_id: string;
  from_account: string;
  kind: ScheduledPaymentKind;
  to_account: string | null;
  biller_id: string | null;
  biller_reference: string | null;
  amount: number; // centavos
  note: string | null;
  frequency: ScheduledPaymentFrequency;
  start_date: string;
  end_date: string | null;
  max_runs: number | null;
  runs_done: number;
  next_run_date: string;
  status: ScheduledPaymentStatus;
  created_at: string;
  updated_at: string;
}

export type ScheduledPaymentRunStatus = 'completed' | 'failed';

export interface ScheduledPaymentRun {
  id: string;
  schedule_id: string;
  run_date: string;
  status: ScheduledPaymentRunStatus;
  transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface PayBillParams {
  from_account: string;
  biller_id: string;
  biller_reference: string;
  amount: number; // centavos
  idempotency_key: string;
}

export interface CreateScheduledPaymentParams {
  from_account: string;
  kind: ScheduledPaymentKind;
  to_account?: string | null;
  biller_id?: string | null;
  biller_reference?: string | null;
  amount: number;
  frequency: ScheduledPaymentFrequency;
  start_date: string;
  end_date?: string | null;
  max_runs?: number | null;
  note?: string | null;
}

