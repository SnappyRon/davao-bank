/**
 * Davao Bank — FX Reference Rates Utilities (§E)
 * Reference rates from European Central Bank via Frankfurter.
 * Strictly view-only; single-currency PHP banking engine.
 */

import type { FXRate, FXPeriod, FXSummary } from '../types';

/**
 * Formats an exchange rate with appropriate precision.
 * USD/PHP and EUR/PHP use 4 decimals (e.g. 58.9500).
 * JPY/PHP uses 4 decimals (e.g. 0.4061).
 */
export function formatFXRate(rate: number, base = 'USD'): string {
  if (isNaN(rate) || rate <= 0) return '0.0000';
  const decimals = base.toUpperCase() === 'JPY' ? 4 : 4;
  return rate.toFixed(decimals);
}

/**
 * Formats a signed rate change string (+0.1500 or -0.0820).
 * Always includes sign explicitly for accessibility and unambiguous reading.
 */
export function formatFXChange(change: number, percent: number): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const absChange = Math.abs(change).toFixed(4);
  const absPercent = Math.abs(percent).toFixed(2);
  return `${sign}${absChange} (${sign}${absPercent}%)`;
}

/**
 * Filters a list of daily FX rates by the requested period.
 * Periods supported: 1W (7 days), 1M (30 days), 3M (90 days), 1Y (365 days).
 * Note: Intraday (1D) is explicitly rejected as the ECB source only publishes daily rates.
 */
export function filterRatesByPeriod(
  rates: FXRate[],
  period: FXPeriod,
  referenceDate?: string | Date
): FXRate[] {
  if (!rates || rates.length === 0) return [];

  // Sort ascending by date
  const sorted = [...rates].sort((a, b) => a.rate_date.localeCompare(b.rate_date));

  const ref = referenceDate
    ? new Date(referenceDate)
    : new Date(sorted[sorted.length - 1].rate_date);

  let daysBack = 7;
  switch (period) {
    case '1W':
      daysBack = 7;
      break;
    case '1M':
      daysBack = 30;
      break;
    case '3M':
      daysBack = 90;
      break;
    case '1Y':
      daysBack = 365;
      break;
  }

  const cutoffDate = new Date(ref);
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const filtered = sorted.filter((r) => r.rate_date >= cutoffStr);
  return filtered.length > 0 ? filtered : sorted.slice(-Math.min(sorted.length, 5));
}

/**
 * Calculates current rate, previous rate, and 24h/daily change summary.
 */
export function calculateFXSummary(rates: FXRate[]): FXSummary | null {
  if (!rates || rates.length === 0) return null;

  // Sort ascending by date
  const sorted = [...rates].sort((a, b) => a.rate_date.localeCompare(b.rate_date));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const latestRate = Number(latest.rate);
  const previousRate = previous ? Number(previous.rate) : null;

  let changeValue = 0;
  let changePercent = 0;
  let direction: 'up' | 'down' | 'flat' = 'flat';

  if (previousRate && previousRate > 0) {
    changeValue = latestRate - previousRate;
    changePercent = (changeValue / previousRate) * 100;
    if (Math.abs(changeValue) < 0.00001) {
      direction = 'flat';
    } else if (changeValue > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }
  }

  return {
    base: latest.base,
    quote: latest.quote,
    latestRate,
    previousRate,
    rateDate: latest.rate_date,
    previousDate: previous ? previous.rate_date : null,
    changeValue,
    changePercent,
    direction,
  };
}

/**
 * Generates an accessible screen-reader summary for charts.
 * Example: "USD to PHP, 1 month, from 56.12 to 57.40"
 */
export function getVoiceOverSummary(
  base: string,
  quote: string,
  period: FXPeriod,
  rates: FXRate[]
): string {
  if (!rates || rates.length === 0) {
    return `${base} to ${quote} reference rates. No data available.`;
  }

  const sorted = [...rates].sort((a, b) => a.rate_date.localeCompare(b.rate_date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const periodLabels: Record<FXPeriod, string> = {
    '1W': '1 week',
    '1M': '1 month',
    '3M': '3 months',
    '1Y': '1 year',
  };

  const startRateStr = Number(first.rate).toFixed(2);
  const endRateStr = Number(last.rate).toFixed(2);

  return `${base} to ${quote}, ${periodLabels[period]}, from ${startRateStr} to ${endRateStr}`;
}
