'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  type PieLabelRenderProps,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatCompactMoney,
  formatCount,
  formatMoney,
  toNumber,
  type OpsAggregates,
} from '@/lib/operations';
import styles from './OperationsDashboard.module.css';

/**
 * Recharts 3 + React 19 / Next.js 16: every chart is a client component.
 * Colours come from admin tokens that meet >= 3:1 on white. Patterns and
 * visible text tables carry the same information, so colour is never the only
 * encoding. `title` and `desc` become SVG <title>/<desc> in Recharts 3.
 */
const COLORS = {
  primary: 'var(--color-primary)',
  blue: 'var(--color-blue-text)',
  red: 'var(--color-red-text)',
  orange: 'var(--color-orange-text)',
  ink: 'var(--color-ink)',
  secondary: 'var(--color-text-secondary)',
};

const DASH_PATTERNS = ['0', '5 3', '2 2', '7 3'];

interface ChartProps {
  reducedMotion: boolean;
}

const axisStyle = { fill: COLORS.secondary, fontSize: 11 };
const legendStyle = { color: COLORS.ink, fontSize: 11 };

function moneyTick(value: unknown) {
  return `₱${formatCompactMoney(value as number | string).toLocaleString('en-US')}`;
}

function countTick(value: unknown) {
  return formatCount(value as number | string);
}

export function VolumeChart({
  rows,
  compare,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['volume']; compare: boolean }) {
  const title = 'Volume over time';
  const desc = rows.map((row) => `${row.label}: ${formatMoney(row.current)}`).join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={rows}
          title={title}
          desc={desc}
          role="img"
          margin={{ top: 8, right: 8 }}
        >
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} />
          <YAxis tickFormatter={moneyTick} tick={axisStyle} tickLine={false} width={64} />
          <Tooltip
            formatter={(value: unknown) => formatMoney(value as number | string)}
          />
          <Legend wrapperStyle={legendStyle} />
          <Line
            type="monotone"
            dataKey="current"
            name="Current period"
            stroke={COLORS.primary}
            strokeWidth={3}
            dot={{ r: 3, fill: COLORS.primary }}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
          {compare ? (
            <Line
              type="monotone"
              dataKey="previous"
              name="Previous period"
              stroke={COLORS.secondary}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={!reducedMotion}
              animationDuration={250}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InOutChart({
  rows,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['inOut'] }) {
  const title = 'Money in and money out';
  const desc = rows
    .map(
      (row) =>
        `${row.label}: in ${formatMoney(row.incoming)}, out ${formatMoney(row.outgoing)}`
    )
    .join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={rows}
          title={title}
          desc={desc}
          role="img"
          margin={{ top: 8, right: 8 }}
        >
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} />
          <YAxis tickFormatter={moneyTick} tick={axisStyle} tickLine={false} width={64} />
          <Tooltip
            formatter={(value: unknown) => formatMoney(value as number | string)}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar
            dataKey="incoming"
            name="In"
            fill={COLORS.blue}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
          <Bar
            dataKey="outgoing"
            name="Out"
            fill={COLORS.red}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({
  rows,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['categories'] }) {
  const title = 'Volume by category';
  const desc = rows.map((row) => `${row.label}: ${row.share}%`).join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart title={title} desc={desc} role="img">
          <Pie
            data={rows}
            dataKey="volume"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={54}
            outerRadius={88}
            label={({ payload }: PieLabelRenderProps) => {
              const entry = payload as { label?: string; share?: number } | undefined;
              return `${entry?.label || ''} ${entry?.share ?? 0}%`;
            }}
            labelLine={false}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          >
            {rows.map((row, index) => (
              <Cell
                key={row.label}
                fill={
                  [
                    COLORS.primary,
                    COLORS.blue,
                    COLORS.orange,
                    COLORS.red,
                    COLORS.ink,
                    COLORS.secondary,
                  ][index % 6]
                }
                fillOpacity={0.85}
                stroke={COLORS.ink}
                strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown) => formatMoney(value as number | string)}
          />
          <Legend wrapperStyle={legendStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusChart({
  rows,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['status'] }) {
  const title = 'Transaction status mix';
  const desc = rows.map((row) => `${row.label}: ${formatCount(row.count)}`).join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={rows}
          title={title}
          desc={desc}
          role="img"
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8 }}
        >
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={countTick}
            tick={axisStyle}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={axisStyle}
            tickLine={false}
            width={90}
          />
          <Tooltip
            formatter={(value: unknown) => formatCount(value as number | string)}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar
            dataKey="count"
            name="Transactions"
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          >
            {rows.map((row, index) => (
              <Cell
                key={row.label}
                fill={[COLORS.primary, COLORS.orange, COLORS.red, COLORS.ink][index % 4]}
                fillOpacity={0.9}
                stroke={COLORS.ink}
                strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceChart({
  rows,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['balance'] }) {
  const title = 'Account balance distribution';
  const desc = rows
    .map((row) => `${row.label}: ${formatCount(row.count)} accounts`)
    .join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={rows}
          title={title}
          desc={desc}
          role="img"
          margin={{ top: 8, right: 8 }}
        >
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval={0} />
          <YAxis tickFormatter={countTick} tick={axisStyle} tickLine={false} width={48} />
          <Tooltip
            formatter={(value: unknown) => formatCount(value as number | string)}
          />
          <Bar
            dataKey="count"
            name="Accounts"
            fill={COLORS.primary}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GrowthChart({
  rows,
  reducedMotion,
}: ChartProps & { rows: OpsAggregates['growth'] }) {
  const title = 'Customer and account growth';
  const desc = rows
    .map(
      (row) =>
        `${row.label}: ${formatCount(row.customers)} customers, ${formatCount(row.accounts)} accounts`
    )
    .join('; ');
  return (
    <div className={styles.chartCanvas}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={rows}
          title={title}
          desc={desc}
          role="img"
          margin={{ top: 8, right: 8 }}
        >
          <CartesianGrid
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} />
          <YAxis tickFormatter={countTick} tick={axisStyle} tickLine={false} width={48} />
          <Tooltip
            formatter={(value: unknown) => formatCount(value as number | string)}
          />
          <Legend wrapperStyle={legendStyle} />
          <Line
            type="monotone"
            dataKey="customers"
            name="Customers"
            stroke={COLORS.blue}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.blue }}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
          <Line
            type="monotone"
            dataKey="accounts"
            name="Accounts"
            stroke={COLORS.orange}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3, fill: COLORS.orange }}
            isAnimationActive={!reducedMotion}
            animationDuration={250}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function chartHasData(rows: readonly unknown[]): boolean {
  return rows.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const values = Object.values(row as Record<string, unknown>);
    return values.some((value) => typeof value === 'number' && value > 0);
  });
}

export function totalOf(rows: readonly number[]): number {
  return rows.reduce((sum, value) => sum + toNumber(value), 0);
}
