import { formatCentavosToPHP } from '@davao-bank/shared';

/** View-only helpers for the 8.5 operations dashboard. No writes, no money logic. */

export type RangePreset = 'today' | '7d' | '30d' | 'custom';
export type OpsBucket = 'day' | 'week' | 'month';

export interface OpsDateRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: OpsBucket;
  label: string;
}

export interface OpsTimeseriesRow {
  bucket: string;
  category: string;
  incoming_centavos: number | string;
  outgoing_centavos: number | string;
  transaction_count: number | string;
  status_mix: Record<string, number | string> | null;
}

export interface OpsGrowthRow {
  bucket: string;
  new_customers: number | string;
  new_accounts: number | string;
}

export interface OpsSummary {
  period: { from: string; to: string; bucket: OpsBucket };
  growth: OpsGrowthRow[];
  schedules: {
    failed_runs: number | string;
    succeeded_runs: number | string;
    failure_codes: Record<string, number | string>;
  };
  security: {
    open_cases: number | string;
    locked_accounts: number | string;
    frozen_accounts: number | string;
    new_devices: number | string;
    signin_failures: number | string | null;
    signin_failures_note: string | null;
  };
}

export interface OpsBalanceRow {
  band: string;
  account_count: number | string;
  total_balance_centavos: number | string;
}

export interface OpsFeedEvent {
  id: number | string;
  kind: 'transaction' | 'security_event' | 'audit_action' | 'schedule_failure';
  occurred_at: string;
  label: string;
  amount_centavos: number | string | null;
  payload: Record<string, unknown> | null;
}

export interface OpsDashboardStats {
  total_users: number | string;
  total_accounts: number | string;
  total_transactions: number | string;
  [key: string]: number | string | undefined;
}

export type WidgetStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface WidgetState<T> {
  status: WidgetStatus;
  data: T | null;
  error: string | null;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfManilaDay(date: Date): Date {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  const shiftedDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return new Date(shiftedDay - MANILA_OFFSET_MS);
}

function parseCustomDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
  const manilaDate = new Date(parsed.getTime() + MANILA_OFFSET_MS);
  if (
    manilaDate.getUTCFullYear() !== year ||
    manilaDate.getUTCMonth() !== month - 1 ||
    manilaDate.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

export function buildDateRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
  now: Date = new Date()
): OpsDateRange {
  const today = startOfManilaDay(now);
  let from: Date;
  let to: Date;
  let label: string;

  if (preset === 'custom') {
    const parsedFrom = parseCustomDay(customFrom);
    const parsedTo = parseCustomDay(customTo);
    if (!parsedFrom || !parsedTo) {
      from = startOfManilaDay(new Date(now.getTime() - 29 * DAY_MS));
      to = new Date(today.getTime() + DAY_MS);
      label = 'Last 30 days';
    } else {
      from = parsedFrom <= parsedTo ? parsedFrom : parsedTo;
      to = new Date((parsedFrom <= parsedTo ? parsedTo : parsedFrom).getTime() + DAY_MS);
      if (to.getTime() - from.getTime() > 365 * DAY_MS) {
        to = new Date(from.getTime() + 365 * DAY_MS);
      }
      label = `${formatDay(from)} – ${formatDay(new Date(to.getTime() - DAY_MS))}`;
    }
  } else if (preset === 'today') {
    from = today;
    to = new Date(today.getTime() + DAY_MS);
    label = 'Today';
  } else {
    const days = preset === '7d' ? 7 : 30;
    from = new Date(today.getTime() - (days - 1) * DAY_MS);
    to = new Date(today.getTime() + DAY_MS);
    label = `Last ${days} days`;
  }

  const length = to.getTime() - from.getTime();
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - length),
    previousTo: from,
    bucket: 'day',
    label,
  };
}

export function formatDay(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
}

export function formatMoney(centavos: number | string | null | undefined): string {
  return formatCentavosToPHP(toNumber(centavos));
}

export function formatCompactMoney(centavos: number | string): number {
  return Math.round(toNumber(centavos) / 100);
}

export function formatCount(value: number | string): string {
  return toNumber(value).toLocaleString('en-US');
}

export function formatDelta(current: number, previous: number | null): string {
  if (previous === null) return 'No previous period selected';
  if (previous === 0) return current === 0 ? 'No change' : 'New in this period';
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return 'No change';
  return `${change > 0 ? '+' : ''}${change}% vs previous period`;
}

/** Never expose a full account number to the browser view. */
export function maskAccount(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `•• ${digits.slice(-4)}`;
}

export function maskEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.includes('@')) return null;
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  return `${local.charAt(0)}••@${domain}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  transfer: 'Transfers',
  bill: 'Bills',
  deposit: 'Deposits',
  withdrawal: 'Cash outs',
  adjustment: 'Adjustments',
  reversal: 'Reversals',
};

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  pending: 'Pending',
  failed: 'Failed',
  reversed: 'Reversed',
};

export const BAND_LABELS: Record<string, string> = {
  under_1000: 'Under ₱1,000',
  '1000_to_9999': '₱1,000 – ₱9,999',
  '10000_to_99999': '₱10,000 – ₱99,999',
  '100000_plus': '₱100,000 and above',
};

export const FEED_KIND_LABELS: Record<string, string> = {
  transaction: 'Transaction',
  security_event: 'Security event',
  audit_action: 'Staff action',
  schedule_failure: 'Schedule failure',
};

export function sentence(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface OpsChartRow {
  label: string;
  current: number;
  previous: number | null;
}

export interface OpsAggregates {
  volume: OpsChartRow[];
  inOut: { label: string; incoming: number; outgoing: number }[];
  categories: { label: string; volume: number; count: number; share: number }[];
  status: { label: string; count: number }[];
  balance: { label: string; count: number; total: number }[];
  growth: { label: string; customers: number; accounts: number }[];
  totals: {
    volume: number;
    transactions: number;
    currentCustomers: number;
    currentAccounts: number;
    previousCustomers: number;
    previousAccounts: number;
    openCases: number;
  };
}

function keyByBucket(rows: OpsTimeseriesRow[]): Map<string, OpsTimeseriesRow[]> {
  const grouped = new Map<string, OpsTimeseriesRow[]>();
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString();
    const bucketRows = grouped.get(key) || [];
    bucketRows.push(row);
    grouped.set(key, bucketRows);
  }
  return grouped;
}

export function aggregateTimeseries(
  current: OpsTimeseriesRow[],
  previous: OpsTimeseriesRow[],
  compare: boolean
): OpsAggregates {
  const currentBuckets = keyByBucket(current);
  const previousBuckets = keyByBucket(previous);
  const bucketKeys = Array.from(currentBuckets.keys()).sort();
  const previousKeys = Array.from(previousBuckets.keys()).sort();

  const sumBucket = (rows: OpsTimeseriesRow[] | undefined) =>
    (rows || []).reduce(
      (acc, row) => {
        acc.incoming += toNumber(row.incoming_centavos);
        acc.outgoing += toNumber(row.outgoing_centavos);
        acc.count += toNumber(row.transaction_count);
        return acc;
      },
      { incoming: 0, outgoing: 0, count: 0 }
    );

  // Previous-period buckets have earlier timestamps, so align by position in
  // the ordered series instead of looking up the current bucket's timestamp.
  const volume = bucketKeys.map((key, index) => {
    const now = sumBucket(currentBuckets.get(key));
    const previousKey = previousKeys[index];
    const before =
      compare && previousKey ? sumBucket(previousBuckets.get(previousKey)) : null;
    return {
      label: formatDay(key),
      current: now.incoming + now.outgoing,
      previous: before ? before.incoming + before.outgoing : null,
    };
  });

  const inOut = bucketKeys.map((key) => {
    const now = sumBucket(currentBuckets.get(key));
    return { label: formatDay(key), incoming: now.incoming, outgoing: now.outgoing };
  });

  const categoryTotals = new Map<string, { volume: number; count: number }>();
  for (const row of current) {
    const key = row.category;
    const bucket = categoryTotals.get(key) || { volume: 0, count: 0 };
    bucket.volume += toNumber(row.incoming_centavos) + toNumber(row.outgoing_centavos);
    bucket.count += toNumber(row.transaction_count);
    categoryTotals.set(key, bucket);
  }
  const totalVolume = Array.from(categoryTotals.values()).reduce(
    (sum, item) => sum + item.volume,
    0
  );
  const categories = Array.from(categoryTotals.entries())
    .map(([key, item]) => ({
      label: CATEGORY_LABELS[key] || sentence(key),
      volume: item.volume,
      count: item.count,
      share: totalVolume > 0 ? Math.round((item.volume / totalVolume) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  const statusTotals = new Map<string, number>();
  for (const row of current) {
    for (const [status, value] of Object.entries(row.status_mix || {})) {
      statusTotals.set(status, (statusTotals.get(status) || 0) + toNumber(value));
    }
  }
  const status = Object.keys(STATUS_LABELS).map((key) => ({
    label: STATUS_LABELS[key],
    count: statusTotals.get(key) || 0,
  }));

  const currentTotals = current.reduce(
    (acc, row) => {
      acc.incoming += toNumber(row.incoming_centavos);
      acc.outgoing += toNumber(row.outgoing_centavos);
      acc.count += toNumber(row.transaction_count);
      return acc;
    },
    { incoming: 0, outgoing: 0, count: 0 }
  );

  return {
    volume,
    inOut,
    categories,
    status,
    balance: [],
    growth: [],
    totals: {
      volume: currentTotals.incoming + currentTotals.outgoing,
      transactions: currentTotals.count,
      currentCustomers: 0,
      currentAccounts: 0,
      previousCustomers: 0,
      previousAccounts: 0,
      openCases: 0,
    },
  };
}

export function aggregateBalance(rows: OpsBalanceRow[]): OpsAggregates['balance'] {
  const order = Object.keys(BAND_LABELS);
  return rows
    .slice()
    .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
    .map((row) => ({
      label: BAND_LABELS[row.band] || sentence(row.band),
      count: toNumber(row.account_count),
      total: toNumber(row.total_balance_centavos),
    }));
}

export function aggregateGrowth(summary: OpsSummary | null): OpsAggregates['growth'] {
  return (summary?.growth || []).map((row) => ({
    label: formatDay(row.bucket),
    customers: toNumber(row.new_customers),
    accounts: toNumber(row.new_accounts),
  }));
}

export function summaryCounts(summary: OpsSummary | null): {
  customers: number;
  accounts: number;
  openCases: number;
} {
  if (!summary) return { customers: 0, accounts: 0, openCases: 0 };
  return {
    customers: summary.growth.reduce((sum, row) => sum + toNumber(row.new_customers), 0),
    accounts: summary.growth.reduce((sum, row) => sum + toNumber(row.new_accounts), 0),
    openCases: toNumber(summary.security?.open_cases),
  };
}
