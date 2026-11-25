import {
  aggregateBalance,
  aggregateGrowth,
  aggregateTimeseries,
  buildDateRange,
  formatDelta,
  maskAccount,
  maskEmail,
  sentence,
  summaryCounts,
  type OpsSummary,
} from '../lib/operations';

describe('operations dashboard helpers', () => {
  it('builds the four presets in Asia/Manila with a previous period', () => {
    const now = new Date('2026-11-26T02:00:00Z');

    const today = buildDateRange('today', '', '', now);
    expect(today.from.toISOString()).toBe('2026-11-25T16:00:00.000Z');
    expect(today.to.toISOString()).toBe('2026-11-26T16:00:00.000Z');
    expect(today.previousFrom.toISOString()).toBe('2026-11-24T16:00:00.000Z');
    expect(today.label).toBe('Today');

    const seven = buildDateRange('7d', '', '', now);
    expect(seven.from.toISOString()).toBe('2026-11-19T16:00:00.000Z');
    expect(seven.label).toBe('Last 7 days');

    const thirty = buildDateRange('30d', '', '', now);
    expect(thirty.from.toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(thirty.label).toBe('Last 30 days');
  });

  it('handles valid and invalid custom dates safely', () => {
    const now = new Date('2026-11-26T02:00:00Z');
    const custom = buildDateRange('custom', '2026-11-01', '2026-11-03', now);
    expect(custom.from.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(custom.to.toISOString()).toBe('2026-11-03T16:00:00.000Z');
    expect(custom.label).toBe('Nov 1 – Nov 3');

    const invalid = buildDateRange('custom', 'not-a-date', '', now);
    expect(invalid.label).toBe('Last 30 days');

    const inverted = buildDateRange('custom', '2026-11-03', '2026-11-01', now);
    expect(inverted.from.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });

  it('masks accounts and emails, and never returns short or non-numeric values', () => {
    expect(maskAccount('1234-5678-9012')).toBe('•• 9012');
    expect(maskAccount('12')).toBeNull();
    expect(maskAccount('abc')).toBeNull();
    expect(maskEmail('customer1@davaobank.ph')).toBe('c••@davaobank.ph');
    expect(maskEmail('no-at-sign')).toBeNull();
  });

  it('describes comparisons without inventing a previous period', () => {
    expect(formatDelta(150, 100)).toBe('+50% vs previous period');
    expect(formatDelta(80, 100)).toBe('-20% vs previous period');
    expect(formatDelta(1, 0)).toBe('New in this period');
    expect(formatDelta(0, 0)).toBe('No change');
    expect(formatDelta(0, null)).toBe('No previous period selected');
  });

  it('aggregates timeseries into all six dashboard views', () => {
    const current = [
      {
        bucket: '2026-11-25T16:00:00.000Z',
        category: 'transfer',
        incoming_centavos: '123456',
        outgoing_centavos: 50000,
        transaction_count: '2',
        status_mix: { completed: 2, pending: 0, failed: 0, reversed: 0 },
      },
      {
        bucket: '2026-11-25T16:00:00.000Z',
        category: 'bill',
        incoming_centavos: 0,
        outgoing_centavos: 20000,
        transaction_count: 1,
        status_mix: { completed: 0, pending: 0, failed: 1, reversed: 0 },
      },
    ];
    const previous = [
      {
        bucket: '2026-10-26T16:00:00.000Z',
        category: 'transfer',
        incoming_centavos: 50000,
        outgoing_centavos: 20000,
        transaction_count: 1,
        status_mix: { completed: 1, pending: 0, failed: 0, reversed: 0 },
      },
    ];

    const result = aggregateTimeseries(current, previous, true);
    expect(result.totals.volume).toBe(193456);
    expect(result.totals.transactions).toBe(3);
    expect(result.volume[0]).toEqual({
      label: 'Nov 26',
      current: 193456,
      previous: 70000,
    });
    expect(result.inOut[0]).toEqual({
      label: 'Nov 26',
      incoming: 123456,
      outgoing: 70000,
    });
    expect(result.categories.map((row) => row.label)).toEqual(['Transfers', 'Bills']);
    expect(result.categories[0].share).toBeGreaterThan(0);
    expect(result.status).toEqual([
      { label: 'Completed', count: 2 },
      { label: 'Pending', count: 0 },
      { label: 'Failed', count: 1 },
      { label: 'Reversed', count: 0 },
    ]);
  });

  it('maps balance bands and growth rows, keeping signin failures explicitly unavailable', () => {
    const balance = aggregateBalance([
      { band: '100000_plus', account_count: 1, total_balance_centavos: 50000000 },
      { band: 'under_1000', account_count: 2, total_balance_centavos: 100000 },
    ]);
    expect(balance.map((row) => row.label)).toEqual([
      'Under ₱1,000',
      '₱100,000 and above',
    ]);

    const summary = {
      period: { from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z', bucket: 'day' },
      growth: [{ bucket: '2026-11-25T16:00:00Z', new_customers: 3, new_accounts: 4 }],
      schedules: { failed_runs: 2, succeeded_runs: 8, failure_codes: { other: 2 } },
      security: {
        open_cases: 5,
        locked_accounts: 1,
        frozen_accounts: 2,
        new_devices: 1,
        signin_failures: null,
        signin_failures_note: 'no reliable source',
      },
    } as OpsSummary;

    expect(aggregateGrowth(summary)).toEqual([
      { label: 'Nov 26', customers: 3, accounts: 4 },
    ]);
    expect(summaryCounts(summary)).toEqual({ customers: 3, accounts: 4, openCases: 5 });
    expect(summary.security.signin_failures).toBeNull();
    expect(summary.security.signin_failures_note).toBe('no reliable source');
    expect(sentence('bill_payment')).toBe('Bill payment');
  });
});
