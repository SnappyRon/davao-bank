/**
 * Davao Bank — FX Reference Rates Utilities (§E)
 * Reference rates from European Central Bank via Frankfurter.
 * Strictly view-only; single-currency PHP banking engine.
 */

import type { FXRate, FXPeriod, FXSummary } from '../types';

export type FXConversionDirection = 'PHP_TO_FX' | 'FX_TO_PHP';

export interface FXConversion {
  /** Rounded minor units of the target currency. */
  resultMinor: number;
  rate: number;
  rateDate: string;
  /** True when the rate is older than the staleness threshold. */
  stale: boolean;
}

/** A reference rate older than this many days is treated as stale. */
export const FX_STALE_AFTER_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "2026-10-26" → local midnight of that calendar day, or null if malformed. */
export function parseFxDateOnly(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * True when the rate date is more than `thresholdDays` calendar days before `now`.
 * Default threshold: FX_STALE_AFTER_DAYS (3 days).
 */
export function isFxRateStale(
  isoDate: string,
  now: Date = new Date(),
  thresholdDays: number = FX_STALE_AFTER_DAYS
): boolean {
  const date = parseFxDateOnly(isoDate);
  if (!date) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = Math.round((today.getTime() - date.getTime()) / MS_PER_DAY);
  return ageDays > thresholdDays;
}

/**
 * Converts a minor-unit amount between PHP and a quoted FX currency using a
 * reference rate. Pair convention: rate is quote (PHP) per 1 base (USD/EUR/JPY).
 * - PHP → FX: resultMinor = round(amountMinor / rate)
 * - FX → PHP: resultMinor = round(amountMinor * rate)
 * Pure: deterministic for the same inputs; never touches the network or state.
 */
export function convertFXAmount(
  amountMinor: number,
  rate: number,
  direction: FXConversionDirection,
  rateDate: string,
  options?: { staleThresholdDays?: number; referenceDate?: Date | string }
): FXConversion {
  const { staleThresholdDays = FX_STALE_AFTER_DAYS, referenceDate = new Date() } =
    options ?? {};
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const stale = isFxRateStale(rateDate, ref, staleThresholdDays);

  let resultMinor = 0;
  if (
    Number.isFinite(amountMinor) &&
    amountMinor > 0 &&
    Number.isFinite(rate) &&
    rate > 0
  ) {
    resultMinor =
      direction === 'FX_TO_PHP'
        ? Math.round(amountMinor * rate)
        : Math.round(amountMinor / rate);
  }

  return { resultMinor, rate, rateDate, stale };
}

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
 * Formats a minor-unit converted amount with the target currency's decimal rules.
 * PHP, USD and EUR use 2 decimals; JPY uses 0 decimals. Never silently truncates.
 */
export function formatFXAmount(minor: number, currency: string): string {
  const value = minor / 100;
  if (!Number.isFinite(value)) return '0.00';
  const decimals = currency.toUpperCase() === 'JPY' ? 0 : 2;
  return value.toFixed(decimals);
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
