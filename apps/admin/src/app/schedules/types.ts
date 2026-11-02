import type {
  ScheduledPaymentKind,
  ScheduledPaymentFrequency,
  ScheduledPaymentStatus,
} from '@davao-bank/shared';

export interface AdminScheduleRunItem {
  id: string;
  schedule_id: string;
  run_date: string;
  status: 'completed' | 'failed';
  transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface AdminScheduleRow {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
  from_account: string;
  from_account_number: string;
  kind: ScheduledPaymentKind;
  to_account: string | null;
  to_account_number: string | null;
  biller_id: string | null;
  biller_name: string | null;
  biller_reference: string | null;
  amount: number;
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
  runs: AdminScheduleRunItem[];
}
