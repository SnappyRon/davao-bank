'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCentavosToPHP } from '@davao-bank/shared';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import {
  aggregateBalance,
  aggregateGrowth,
  aggregateTimeseries,
  buildDateRange,
  formatCount,
  formatDelta,
  RANGE_PRESETS,
  summaryCounts,
  toNumber,
  type OpsBalanceRow,
  type OpsDashboardStats,
  type OpsDateRange,
  type OpsSummary,
  type OpsTimeseriesRow,
  type RangePreset,
  type WidgetState,
} from '@/lib/operations';
import { AllChartCards } from './OpsChartCards';
import { OpsLiveFeed } from './OpsLiveFeed';
import { OpsRecentActivity, OpsSecurityPanel } from './OpsPanels';
import { CardSkeleton, OpsEmpty, OpsError, OpsLink, TryAgain } from './OpsPrimitives';
import styles from './OperationsDashboard.module.css';

function useOpsRpc<T>(
  rpc: string | null,
  args: Record<string, unknown> | null
): WidgetState<T> & { reload: () => void } {
  const supabase = useMemo(() => createAdminBrowserClient(), []);
  const argsKey = useMemo(() => JSON.stringify(args), [args]);
  const [state, setState] = useState<WidgetState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!rpc || !args) {
      setState({ status: 'ready', data: null, error: null });
      return () => {
        cancelled = true;
      };
    }
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    void (async () => {
      try {
        const { data, error } = await supabase.rpc(
          rpc,
          JSON.parse(argsKey) as Record<string, unknown>
        );
        if (cancelled) return;
        if (error) {
          setState({
            status: 'error',
            data: null,
            error: 'Could not load dashboard data.',
          });
          return;
        }
        setState({ status: 'ready', data: data as T, error: null });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: 'Could not load dashboard data.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [argsKey, nonce, rpc, supabase]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}

function withEmptiness<T>(
  state: WidgetState<T>,
  isEmpty: (data: T | null) => boolean
): WidgetState<T> {
  if (state.status === 'ready' && isEmpty(state.data)) {
    return { ...state, status: 'empty' };
  }
  return state;
}

function previousPeriodNote(
  status: WidgetState<unknown>['status'],
  current: number,
  previous: number | null,
  unavailable: string
): string {
  if (status === 'loading') return 'Comparing to previous period…';
  if (status === 'ready') return formatDelta(current, previous);
  return unavailable;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }, []);
  return reduced;
}

interface RangeControlsProps {
  preset: RangePreset;
  onPreset: (value: RangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  compare: boolean;
  onCompare: (value: boolean) => void;
  range: OpsDateRange;
}

function RangeControls({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  compare,
  onCompare,
  range,
}: RangeControlsProps) {
  return (
    <section
      className={`${styles.card} ${styles.rangeCard}`}
      aria-labelledby="ops-range-title"
    >
      <h3 id="ops-range-title" className={styles.cardTitle}>
        Reporting period
      </h3>
      <div className={styles.segmented} role="group" aria-label="Date range">
        {RANGE_PRESETS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.segment}
            aria-pressed={preset === option.value}
            onClick={() => onPreset(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className={styles.customRange}>
          <label className={styles.fieldLabel} htmlFor="ops-from">
            From date
            <input
              id="ops-from"
              className={styles.dateInput}
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(event) => onCustomFrom(event.target.value)}
            />
          </label>
          <label className={styles.fieldLabel} htmlFor="ops-to">
            To date
            <input
              id="ops-to"
              className={styles.dateInput}
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(event) => onCustomTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <label className={styles.compareControl} htmlFor="ops-compare">
        <input
          id="ops-compare"
          type="checkbox"
          checked={compare}
          onChange={(event) => onCompare(event.target.checked)}
        />
        Compare to previous period
      </label>
      <p className={styles.rangeCaption} role="status" aria-live="polite">
        {range.label}
      </p>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  state: WidgetState<unknown>;
  value: string;
  note: string;
  onRetry: () => void;
  href?: string;
}

function MetricCard({ label, state, value, note, onRetry, href }: MetricCardProps) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      {state.status === 'loading' ? <CardSkeleton /> : null}
      {state.status === 'error' ? (
        <OpsError message="Not available." onRetry={onRetry} />
      ) : null}
      {state.status === 'empty' ? <span className={styles.metricValue}>0</span> : null}
      {state.status === 'ready' ? (
        <>
          {href ? (
            <OpsLink href={href}>
              <span className={styles.metricValue}>{value}</span>
            </OpsLink>
          ) : (
            <span className={styles.metricValue}>{value}</span>
          )}
          <span className={styles.metricNote}>{note}</span>
        </>
      ) : null}
    </div>
  );
}

export function OperationsDashboard() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [compare, setCompare] = useState(false);
  const reducedMotion = useReducedMotion();

  const range = useMemo(
    () => buildDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const previousFrom = range.previousFrom.toISOString();
  const previousTo = range.previousTo.toISOString();

  const timeseries = useOpsRpc<OpsTimeseriesRow[]>('admin_ops_timeseries', {
    p_from: from,
    p_to: to,
    p_bucket: 'day',
  });
  const previousTimeseries = useOpsRpc<OpsTimeseriesRow[]>(
    compare ? 'admin_ops_timeseries' : null,
    compare ? { p_from: previousFrom, p_to: previousTo, p_bucket: 'day' } : null
  );
  const summary = useOpsRpc<OpsSummary>('admin_ops_summary', {
    p_from: from,
    p_to: to,
    p_bucket: 'day',
  });
  const previousSummary = useOpsRpc<OpsSummary>(
    compare ? 'admin_ops_summary' : null,
    compare ? { p_from: previousFrom, p_to: previousTo, p_bucket: 'day' } : null
  );
  const balance = useOpsRpc<OpsBalanceRow[]>('admin_ops_balance_distribution', {});
  const stats = useOpsRpc<OpsDashboardStats>('admin_get_dashboard_stats', {});

  const hasActivity = (timeseries.data || []).some(
    (row) =>
      toNumber(row.incoming_centavos) + toNumber(row.outgoing_centavos) > 0 ||
      toNumber(row.transaction_count) > 0
  );
  const timeseriesWidget = withEmptiness(timeseries, () => !hasActivity);
  const balanceWidget = withEmptiness(balance, (rows) => !rows || rows.length === 0);
  const summaryWidget = withEmptiness(summary, (value) => !value);

  const aggregates = useMemo(
    () =>
      aggregateTimeseries(
        timeseries.data || [],
        compare ? previousTimeseries.data || [] : [],
        compare
      ),
    [compare, previousTimeseries.data, timeseries.data]
  );
  const previousAggregates = useMemo(
    () => aggregateTimeseries(previousTimeseries.data || [], [], false),
    [previousTimeseries.data]
  );
  const balanceRows = useMemo(() => aggregateBalance(balance.data || []), [balance.data]);
  const growthRows = useMemo(() => aggregateGrowth(summary.data || null), [summary.data]);
  aggregates.balance = balanceRows;
  aggregates.growth = growthRows;

  const counts = summaryCounts(summary.data || null);
  const previousCounts = summaryCounts(previousSummary.data || null);
  const previousUnavailable = 'Previous period unavailable';
  const heroPrevious =
    compare && previousTimeseries.status === 'ready'
      ? previousAggregates.totals.volume
      : null;
  const heroNote = compare
    ? previousPeriodNote(
        previousTimeseries.status,
        aggregates.totals.volume,
        heroPrevious,
        previousUnavailable
      )
    : range.label;
  const transactionNote = compare
    ? previousPeriodNote(
        previousTimeseries.status,
        aggregates.totals.transactions,
        previousAggregates.totals.transactions,
        previousUnavailable
      )
    : 'In the selected period';
  const customerNote = !compare
    ? `New in period: ${formatCount(counts.customers)}`
    : previousSummary.status === 'loading'
      ? 'Comparing to previous period…'
      : previousSummary.status === 'ready'
        ? `New: ${formatCount(counts.customers)} vs ${formatCount(previousCounts.customers)} previously`
        : previousUnavailable;
  const totalAccounts = toNumber(stats.data?.total_accounts);
  const totalCustomers = toNumber(stats.data?.total_users);

  const refreshAll = useCallback(() => {
    timeseries.reload();
    previousTimeseries.reload();
    summary.reload();
    previousSummary.reload();
    balance.reload();
    stats.reload();
  }, [balance, previousSummary, previousTimeseries, stats, summary, timeseries]);

  return (
    <div className={styles.dashboard}>
      <div className={styles.topGrid}>
        <section
          className={`${styles.card} ${styles.hero}`}
          aria-labelledby="ops-hero-title"
        >
          <span className={styles.heroEyebrow}>Headline metric</span>
          <h3 id="ops-hero-title" className={styles.heroLabel}>
            Total volume
          </h3>
          {timeseriesWidget.status === 'loading' ? <CardSkeleton /> : null}
          {timeseriesWidget.status === 'error' ? (
            <OpsError message="Volume could not be loaded." onRetry={timeseries.reload} />
          ) : null}
          {timeseriesWidget.status === 'empty' ? (
            <OpsEmpty message="No volume in this period" />
          ) : null}
          {timeseriesWidget.status === 'ready' ? (
            <p className={styles.heroValue} aria-live="polite">
              {formatCentavosToPHP(aggregates.totals.volume)}
            </p>
          ) : null}
          <p className={styles.heroNote} aria-live="polite">
            {heroNote}
          </p>
        </section>
        <RangeControls
          preset={preset}
          onPreset={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          compare={compare}
          onCompare={setCompare}
          range={range}
        />
      </div>

      <section className={styles.metricGrid} aria-label="Key metrics">
        <MetricCard
          label="Total transactions"
          state={withEmptiness(
            { ...timeseries, data: aggregates.totals.transactions },
            (value) => !value
          )}
          value={formatCount(aggregates.totals.transactions)}
          note={transactionNote}
          onRetry={timeseries.reload}
        />
        <MetricCard
          label="Accounts"
          state={withEmptiness(stats, () => totalAccounts === 0)}
          value={formatCount(totalAccounts)}
          note={`New in period: ${formatCount(counts.accounts)}`}
          onRetry={stats.reload}
        />
        <MetricCard
          label="Customers"
          state={withEmptiness(stats, () => totalCustomers === 0)}
          value={formatCount(totalCustomers)}
          note={customerNote}
          onRetry={stats.reload}
        />
        <MetricCard
          label="Open cases"
          state={withEmptiness(summary, () => counts.openCases === 0)}
          value={formatCount(counts.openCases)}
          note="Bantay cases awaiting review"
          onRetry={summary.reload}
          href="/cases"
        />
      </section>

      <div className={styles.chartGrid}>
        <AllChartCards
          aggregates={aggregates}
          timeseries={timeseriesWidget}
          balance={balanceWidget}
          summary={summaryWidget}
          onRetryTimeseries={timeseries.reload}
          onRetryBalance={balance.reload}
          onRetrySummary={summary.reload}
          compare={compare}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className={styles.bottomGrid}>
        <OpsLiveFeed onActivity={refreshAll} />
        <OpsSecurityPanel summary={summaryWidget} onRetry={summary.reload} />
        <OpsRecentActivity />
      </div>

      <div className={styles.footerNote}>
        <TryAgain label="Refresh all" onRetry={refreshAll} />
      </div>
    </div>
  );
}
