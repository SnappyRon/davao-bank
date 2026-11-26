'use client';

import React from 'react';
import {
  BalanceChart,
  CategoryChart,
  GrowthChart,
  InOutChart,
  StatusChart,
  VolumeChart,
} from './OpsCharts';
import {
  BarsSkeleton,
  LineSkeleton,
  OpsCard,
  OpsEmpty,
  OpsError,
  RingSkeleton,
} from './OpsPrimitives';
import {
  formatCount,
  formatMoney,
  type OpsAggregates,
  type WidgetState,
} from '@/lib/operations';
import styles from './OperationsDashboard.module.css';

type SkeletonKind = 'line' | 'bars' | 'ring';

interface ChartCardProps {
  title: string;
  description: string;
  state: WidgetState<unknown>;
  onRetry: () => void;
  emptyMessage: string;
  skeleton: SkeletonKind;
  hasData: boolean;
  summary: string;
  children: React.ReactNode;
}

function SkeletonFor({ kind }: { kind: SkeletonKind }) {
  if (kind === 'ring') return <RingSkeleton />;
  if (kind === 'bars') return <BarsSkeleton />;
  return <LineSkeleton />;
}

function ChartCard({
  title,
  description,
  state,
  onRetry,
  emptyMessage,
  skeleton,
  hasData,
  summary,
  children,
}: ChartCardProps) {
  return (
    <OpsCard title={title} description={description} className={styles.chartCard}>
      <p className={styles.visuallyHidden} aria-live="polite">
        {summary}
      </p>
      {state.status === 'loading' ? <SkeletonFor kind={skeleton} /> : null}
      {state.status === 'error' ? (
        <OpsError message="This chart could not be loaded." onRetry={onRetry} />
      ) : null}
      {(state.status === 'ready' && !hasData) || state.status === 'empty' ? (
        <OpsEmpty message={emptyMessage} />
      ) : null}
      {state.status === 'ready' && hasData ? children : null}
    </OpsCard>
  );
}

interface AllChartCardsProps {
  aggregates: OpsAggregates;
  timeseries: WidgetState<unknown>;
  balance: WidgetState<unknown>;
  summary: WidgetState<unknown>;
  onRetryTimeseries: () => void;
  onRetryBalance: () => void;
  onRetrySummary: () => void;
  compare: boolean;
  reducedMotion: boolean;
}

export function AllChartCards({
  aggregates,
  timeseries,
  balance,
  summary,
  onRetryTimeseries,
  onRetryBalance,
  onRetrySummary,
  compare,
  reducedMotion,
}: AllChartCardsProps) {
  const nonZero = (values: number[]) => values.some((value) => value > 0);
  const volumeData = aggregates.volume.filter(
    (row) => row.current > 0 || (compare && (row.previous || 0) > 0)
  );
  const inOutData = aggregates.inOut.filter(
    (row) => row.incoming > 0 || row.outgoing > 0
  );
  const categoryData = aggregates.categories.filter((row) => row.volume > 0);
  const statusData = aggregates.status.filter((row) => row.count > 0);
  const balanceData = aggregates.balance.filter((row) => row.count > 0);
  const growthData = aggregates.growth.filter(
    (row) => row.customers > 0 || row.accounts > 0
  );

  return (
    <>
      <ChartCard
        title="Volume over time"
        description="Total money moved in each period"
        state={timeseries}
        onRetry={onRetryTimeseries}
        emptyMessage="No volume in this period"
        skeleton="line"
        hasData={nonZero(volumeData.map((row) => row.current))}
        summary={`Volume chart. ${volumeData.length} periods shown.`}
      >
        <VolumeChart rows={volumeData} compare={compare} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Volume over time, text version</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Current volume</th>
              {compare ? <th scope="col">Previous volume</th> : null}
            </tr>
          </thead>
          <tbody>
            {volumeData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatMoney(row.current)}</td>
                {compare ? (
                  <td>{row.previous === null ? '—' : formatMoney(row.previous)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <ChartCard
        title="In vs out"
        description="Money arriving and leaving customer accounts"
        state={timeseries}
        onRetry={onRetryTimeseries}
        emptyMessage="No money moved in this period"
        skeleton="bars"
        hasData={inOutData.length > 0}
        summary={`Money in and out chart. ${inOutData.length} periods shown.`}
      >
        <InOutChart rows={inOutData} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Money in and out, text version</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">In</th>
              <th scope="col">Out</th>
            </tr>
          </thead>
          <tbody>
            {inOutData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatMoney(row.incoming)}</td>
                <td>{formatMoney(row.outgoing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <ChartCard
        title="By category"
        description="Where the volume comes from"
        state={timeseries}
        onRetry={onRetryTimeseries}
        emptyMessage="No transactions yet"
        skeleton="ring"
        hasData={categoryData.length > 0}
        summary={`Category chart. ${categoryData.length} categories shown.`}
      >
        <CategoryChart rows={categoryData} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Volume by category, text version</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Volume</th>
              <th scope="col">Share</th>
              <th scope="col">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {categoryData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatMoney(row.volume)}</td>
                <td>{row.share}%</td>
                <td>{formatCount(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <ChartCard
        title="Status mix"
        description="How transactions end"
        state={timeseries}
        onRetry={onRetryTimeseries}
        emptyMessage="No statuses to show"
        skeleton="ring"
        hasData={statusData.length > 0}
        summary={`Status mix chart. ${statusData.reduce((sum, row) => sum + row.count, 0)} transactions shown.`}
      >
        <StatusChart rows={statusData} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Transaction status mix, text version</caption>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {statusData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatCount(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <ChartCard
        title="Balance distribution"
        description="How customer balances are spread"
        state={balance}
        onRetry={onRetryBalance}
        emptyMessage="No accounts to show"
        skeleton="bars"
        hasData={balanceData.length > 0}
        summary={`Balance distribution chart. ${balanceData.length} bands shown.`}
      >
        <BalanceChart rows={balanceData} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Balance distribution, text version</caption>
          <thead>
            <tr>
              <th scope="col">Balance band</th>
              <th scope="col">Accounts</th>
              <th scope="col">Total balance</th>
            </tr>
          </thead>
          <tbody>
            {balanceData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatCount(row.count)}</td>
                <td>{formatMoney(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <ChartCard
        title="Customer and account growth"
        description="New customers and accounts per period"
        state={summary}
        onRetry={onRetrySummary}
        emptyMessage="No growth in this period"
        skeleton="line"
        hasData={growthData.length > 0}
        summary={`Growth chart. ${growthData.length} periods shown.`}
      >
        <GrowthChart rows={growthData} reducedMotion={reducedMotion} />
        <table className={styles.dataTable}>
          <caption>Customer and account growth, text version</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">New customers</th>
              <th scope="col">New accounts</th>
            </tr>
          </thead>
          <tbody>
            {growthData.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatCount(row.customers)}</td>
                <td>{formatCount(row.accounts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}
