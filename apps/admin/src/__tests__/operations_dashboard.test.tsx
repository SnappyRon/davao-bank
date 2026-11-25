import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

jest.mock('recharts', () => {
  const ReactModule: typeof React = jest.requireActual('react');
  const chart = ({ title, desc }: { title?: string; desc?: string }) =>
    ReactModule.createElement(
      'svg',
      { role: 'img', 'aria-label': title },
      ReactModule.createElement('title', null, title),
      ReactModule.createElement('desc', null, desc)
    );
  return {
    LineChart: chart,
    BarChart: chart,
    PieChart: chart,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('div', null, children),
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Line: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
  };
});

interface FakeBackend {
  rpc: jest.Mock;
  audit: unknown[];
  auditError: unknown;
  assurance: { data: { currentLevel: string }; error: unknown };
  feed: unknown[];
  timeseries: unknown[];
  previousTimeseries: unknown[];
  summary: unknown;
  previousSummary: unknown;
  balance: unknown[];
  stats: unknown;
  reducedMotion: boolean;
  subscriptionStatus: string;
  eventHandler: ((payload: { new: unknown }) => void) | null;
  subscriptionCallback: ((status: string) => void) | null;
}

const mockBackend: FakeBackend = {
  rpc: jest.fn(),
  audit: [],
  auditError: null,
  assurance: { data: { currentLevel: 'aal2' }, error: null },
  feed: [],
  timeseries: [],
  previousTimeseries: [],
  summary: null,
  previousSummary: null,
  balance: [],
  stats: null,
  reducedMotion: false,
  subscriptionStatus: 'SUBSCRIBED',
  eventHandler: null,
  subscriptionCallback: null,
};

jest.mock('@/lib/supabase-browser', () => ({
  createAdminBrowserClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => mockBackend.rpc(name, args),
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () =>
            Promise.resolve({ data: mockBackend.audit, error: mockBackend.auditError }),
        }),
      }),
    }),
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () => Promise.resolve(mockBackend.assurance),
      },
    },
    channel: () => {
      const channel = {
        on: (
          _event: string,
          _filter: unknown,
          handler: (payload: { new: unknown }) => void
        ) => {
          mockBackend.eventHandler = handler;
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          mockBackend.subscriptionCallback = callback;
          callback(mockBackend.subscriptionStatus);
          return channel;
        },
        unsubscribe: jest.fn(),
      };
      return channel;
    },
  }),
}));

import { AllChartCards } from '../components/operations/OpsChartCards';
import { OperationsDashboard } from '../components/operations/OperationsDashboard';
import { OpsLiveFeed } from '../components/operations/OpsLiveFeed';
import { OpsRecentActivity, OpsSecurityPanel } from '../components/operations/OpsPanels';
import {
  aggregateBalance,
  aggregateGrowth,
  aggregateTimeseries,
  type OpsAggregates,
  type OpsSummary,
  type WidgetState,
} from '../lib/operations';

const TIMESERIES_ROW = {
  bucket: '2026-11-25T16:00:00.000Z',
  category: 'transfer',
  incoming_centavos: 123456,
  outgoing_centavos: 45600,
  transaction_count: 3,
  status_mix: { completed: 2, pending: 1, failed: 0, reversed: 0 },
};

const FEED_EVENT = {
  id: 501,
  kind: 'transaction',
  occurred_at: '2026-11-26T02:00:00.000Z',
  label: 'transfer',
  amount_centavos: 123456,
  payload: { status: 'completed', category: 'transfer', account_last4: '1234' },
};

const SUMMARY: OpsSummary = {
  period: { from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z', bucket: 'day' },
  growth: [{ bucket: '2026-11-25T16:00:00.000Z', new_customers: 3, new_accounts: 4 }],
  schedules: { failed_runs: 2, succeeded_runs: 8, failure_codes: { other: 2 } },
  security: {
    open_cases: 5,
    locked_accounts: 1,
    frozen_accounts: 2,
    new_devices: 1,
    signin_failures: null,
    signin_failures_note: 'no reliable source',
  },
};

function aggregates(rows: unknown[] = [TIMESERIES_ROW]): OpsAggregates {
  const result = aggregateTimeseries(rows as never, [], false);
  result.balance = aggregateBalance([
    { band: 'under_1000', account_count: 4, total_balance_centavos: 100000 },
  ]);
  result.growth = aggregateGrowth(SUMMARY);
  return result;
}

function emptyAggregates(): OpsAggregates {
  const result = aggregateTimeseries([], [], false);
  result.balance = [];
  result.growth = [];
  return result;
}

function state<T>(status: WidgetState<T>['status'], data: T | null): WidgetState<T> {
  return { status, data, error: null };
}

function readyProps(compare = false) {
  return {
    aggregates: aggregates(),
    timeseries: state('ready', [TIMESERIES_ROW]),
    balance: state('ready', []),
    summary: state('ready', SUMMARY),
    onRetryTimeseries: jest.fn(),
    onRetryBalance: jest.fn(),
    onRetrySummary: jest.fn(),
    compare,
    reducedMotion: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBackend.audit = [];
  mockBackend.auditError = null;
  mockBackend.assurance = { data: { currentLevel: 'aal2' }, error: null };
  mockBackend.feed = [FEED_EVENT];
  mockBackend.timeseries = [TIMESERIES_ROW];
  mockBackend.previousTimeseries = [
    {
      ...TIMESERIES_ROW,
      bucket: '2026-10-26T16:00:00.000Z',
      incoming_centavos: 50000,
      outgoing_centavos: 20000,
      transaction_count: 1,
    },
  ];
  mockBackend.summary = SUMMARY;
  mockBackend.previousSummary = SUMMARY;
  mockBackend.balance = [
    { band: 'under_1000', account_count: 4, total_balance_centavos: 100000 },
  ];
  mockBackend.stats = { total_users: 12, total_accounts: 20 };
  mockBackend.reducedMotion = false;
  mockBackend.subscriptionStatus = 'SUBSCRIBED';
  mockBackend.eventHandler = null;
  mockBackend.subscriptionCallback = null;
  mockBackend.rpc = jest.fn(async (name: string, args?: Record<string, unknown>) => {
    const isPreviousPeriod = args?.p_from === '2026-10-28T16:00:00.000Z';
    const data =
      name === 'admin_ops_timeseries'
        ? isPreviousPeriod
          ? mockBackend.previousTimeseries
          : mockBackend.timeseries
        : name === 'admin_ops_balance_distribution'
          ? mockBackend.balance
          : name === 'admin_ops_summary'
            ? mockBackend.summary
            : name === 'admin_ops_live_feed'
              ? mockBackend.feed
              : mockBackend.stats;
    return { data, error: null };
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: mockBackend.reducedMotion,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

describe('operations chart cards', () => {
  it('shows shape-matching skeletons while widgets load', () => {
    render(
      <AllChartCards
        aggregates={emptyAggregates()}
        timeseries={state('loading', null)}
        balance={state('loading', null)}
        summary={state('loading', null)}
        onRetryTimeseries={jest.fn()}
        onRetryBalance={jest.fn()}
        onRetrySummary={jest.fn()}
        compare={false}
        reducedMotion={false}
      />
    );

    expect(document.querySelectorAll('.lineSkeleton').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.barsSkeleton').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.ringSkeleton').length).toBeGreaterThan(0);
  });

  it('shows a distinct empty message for every chart', () => {
    render(
      <AllChartCards
        aggregates={emptyAggregates()}
        timeseries={state('ready', [])}
        balance={state('ready', [])}
        summary={state('ready', null)}
        onRetryTimeseries={jest.fn()}
        onRetryBalance={jest.fn()}
        onRetrySummary={jest.fn()}
        compare={false}
        reducedMotion={false}
      />
    );

    for (const message of [
      'No volume in this period',
      'No money moved in this period',
      'No transactions yet',
      'No statuses to show',
      'No accounts to show',
      'No growth in this period',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  });

  it('makes every loaded chart accessible with a title, desc and visible text table', () => {
    render(<AllChartCards {...readyProps(true)} />);

    for (const name of [
      'Volume over time',
      'Money in and money out',
      'Volume by category',
      'Transaction status mix',
      'Account balance distribution',
      'Customer and account growth',
    ]) {
      const chart = screen.getByRole('img', { name });
      expect(chart.querySelector('desc')?.textContent).toBeTruthy();
    }
    for (const caption of [
      'Volume over time, text version',
      'Money in and out, text version',
      'Volume by category, text version',
      'Transaction status mix, text version',
      'Balance distribution, text version',
      'Customer and account growth, text version',
    ]) {
      expect(screen.getByRole('table', { name: caption })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('columnheader', { name: 'Previous volume' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Transfers').length).toBeGreaterThan(0);
    expect(screen.getByText('In')).toBeInTheDocument();
    expect(screen.getByText('Out')).toBeInTheDocument();
  });

  it('offers a working Try again on an errored chart', () => {
    const onRetry = jest.fn();
    render(
      <AllChartCards
        {...readyProps()}
        timeseries={{ status: 'error', data: null, error: 'failed' }}
        onRetryTimeseries={onRetry}
      />
    );

    const chart = screen.getByRole('region', { name: 'Volume over time' });
    fireRetry(within(chart));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

function fireRetry(scope: ReturnType<typeof within>) {
  fireEvent.click(scope.getByRole('button', { name: 'Try again' }));
}

async function waitForHero() {
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Total volume' })).getByText('₱1,690.56')
    ).toBeInTheDocument()
  );
}

describe('live transaction feed', () => {
  it('masks accounts, announces politely and honours reduced motion', async () => {
    mockBackend.reducedMotion = true;
    render(<OpsLiveFeed />);

    await waitFor(() => expect(screen.getByText('•• 1234')).toBeInTheDocument());
    expect(screen.getByText('₱1,234.56')).toBeInTheDocument();
    expect(screen.getByText('Transaction · Transfer · Completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/transactions'
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(document.querySelector('.feedRow')?.className).not.toContain('newRow');
  });

  it('adds a realtime row with an animation when motion is allowed', async () => {
    render(<OpsLiveFeed />);
    await waitFor(() => expect(screen.getByText('•• 1234')).toBeInTheDocument());

    await act(async () => {
      mockBackend.eventHandler?.({
        new: {
          ...FEED_EVENT,
          id: 502,
          label: 'bill',
          payload: { account_last4: '9876' },
        },
      });
    });

    expect(screen.getByText('•• 9876')).toBeInTheDocument();
    const rows = document.querySelectorAll('.feedRow');
    expect(rows.length).toBe(2);
    expect(Array.from(rows).some((row) => row.className.includes('newRow'))).toBe(true);
  });

  it('shows reconnecting and disconnected states without faking rows', async () => {
    render(<OpsLiveFeed />);
    await waitFor(() => expect(mockBackend.subscriptionCallback).not.toBeNull());

    await act(async () => mockBackend.subscriptionCallback?.('TIMED_OUT'));
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();

    await act(async () => mockBackend.subscriptionCallback?.('CLOSED'));
    expect(
      screen.getByText("You're offline — the feed will refresh when you're back")
    ).toBeInTheDocument();
    expect(screen.getByText('•• 1234')).toBeInTheDocument();
  });

  it('shows the AAL2 denied state with a staff sign-in link', async () => {
    mockBackend.assurance = { data: { currentLevel: 'aal1' }, error: null };
    render(<OpsLiveFeed />);

    await waitFor(() =>
      expect(screen.getByText(/AAL2 denied — sign in again/)).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: 'Staff sign in' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(
      screen.getByText('Live data needs a verified staff session.')
    ).toBeInTheDocument();
  });

  it('shows an empty state and recovers from an error with Try again', async () => {
    mockBackend.feed = [];
    const { unmount } = render(<OpsLiveFeed />);
    await waitFor(() =>
      expect(
        screen.getByText('No activity yet. The feed updates when real events arrive.')
      ).toBeInTheDocument()
    );
    unmount();

    mockBackend.rpc.mockImplementation(async (name: string) => {
      if (name === 'admin_ops_live_feed')
        return { data: null, error: new Error('denied') };
      return { data: [], error: null };
    });
    const retry = render(<OpsLiveFeed />);
    await waitFor(() =>
      expect(screen.getByText('The live feed could not be loaded.')).toBeInTheDocument()
    );

    mockBackend.rpc.mockImplementation(async (name: string) => {
      if (name === 'admin_ops_live_feed') return { data: [FEED_EVENT], error: null };
      return { data: [], error: null };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('•• 1234')).toBeInTheDocument());
    retry.unmount();
  });
});

describe('security panel and recent admin activity', () => {
  it('shows real signals and never fakes failed sign-ins', async () => {
    render(<OpsSecurityPanel summary={state('ready', SUMMARY)} onRetry={jest.fn()} />);

    expect(screen.getAllByText('Open cases').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Review cases' })).toHaveAttribute(
      'href',
      '/cases'
    );
    expect(screen.getByText('Locked accounts')).toBeInTheDocument();
    expect(screen.getByText('Frozen accounts')).toBeInTheDocument();
    expect(screen.getByText('Failed scheduled payments')).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText('no reliable source')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('mirrors the AAL2 denied state', async () => {
    mockBackend.assurance = { data: { currentLevel: 'aal1' }, error: null };
    render(<OpsSecurityPanel summary={state('ready', SUMMARY)} onRetry={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/AAL2 denied — sign in again/)).toBeInTheDocument()
    );
    expect(
      screen.getByText('Live security data needs a verified staff session.')
    ).toBeInTheDocument();
  });

  it('shows error and empty states for the security panel', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <OpsSecurityPanel
        summary={{ status: 'error', data: null, error: 'x' }}
        onRetry={onRetry}
      />
    );
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Security panel' })).getByRole('button', {
        name: 'Try again',
      })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <OpsSecurityPanel summary={state<OpsSummary>('empty', null)} onRetry={onRetry} />
    );
    expect(screen.getByText('No security signals in this period')).toBeInTheDocument();
  });

  it('renders audited staff actions in sentence case with no raw ids', async () => {
    mockBackend.audit = [
      {
        id: '8f043910-1234-4567-8901-123456789012',
        actor_role: 'admin',
        action: 'funds_transferred',
        entity: 'accounts',
        created_at: '2026-11-26T02:00:00.000Z',
      },
    ];
    render(<OpsRecentActivity />);

    await waitFor(() => expect(screen.getByText('Transfer sent')).toBeInTheDocument());
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText(/8f043910/)).not.toBeInTheDocument();
  });

  it('shows recent activity empty and error states', async () => {
    const { rerender } = render(<OpsRecentActivity />);
    await waitFor(() =>
      expect(screen.getByText('No staff activity recorded yet')).toBeInTheDocument()
    );

    mockBackend.auditError = new Error('denied');
    rerender(<OpsRecentActivity key="error" />);
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument()
    );
  });
});

describe('dashboard integration', () => {
  it('has one hero, four distinct metrics and no duplicate stat tiles', async () => {
    render(<OperationsDashboard />);

    await waitForHero();
    expect(screen.getByRole('heading', { name: 'Total volume' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Total volume' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Key metrics' })).toBeInTheDocument();
    const metrics = within(screen.getByRole('region', { name: 'Key metrics' }));
    expect(metrics.getByText('Total transactions')).toBeInTheDocument();
    expect(metrics.getByText('Accounts')).toBeInTheDocument();
    expect(metrics.getByText('Customers')).toBeInTheDocument();
    expect(screen.getAllByText('Open cases').length).toBeGreaterThanOrEqual(1);
  });

  it('switches presets, accepts custom dates and requests the previous period', async () => {
    render(<OperationsDashboard />);

    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(
      await within(screen.getByRole('region', { name: 'Reporting period' })).findByText(
        'Last 7 days'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('To date'), {
      target: { value: '2026-11-03' },
    });
    expect(
      await within(screen.getByRole('region', { name: 'Reporting period' })).findByText(
        'Nov 1 – Nov 3'
      )
    ).toBeInTheDocument();

    const callsBefore = mockBackend.rpc.mock.calls.length;
    fireEvent.click(screen.getByLabelText('Compare to previous period'));
    await waitFor(() =>
      expect(mockBackend.rpc.mock.calls.length).toBeGreaterThan(callsBefore)
    );
    expect(mockBackend.rpc).toHaveBeenCalledWith(
      'admin_ops_timeseries',
      expect.objectContaining({ p_bucket: 'day' })
    );
    const table = screen.getByRole('table', { name: 'Volume over time, text version' });
    await waitFor(() => {
      const cells = within(table).getAllByRole('cell');
      expect(cells[cells.length - 1]).toHaveTextContent('₱700.00');
    });
  });

  it('re-requests widgets from Refresh all', async () => {
    render(<OperationsDashboard />);
    await waitForHero();

    const before = mockBackend.rpc.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh all' }));
    await waitFor(() =>
      expect(mockBackend.rpc.mock.calls.length).toBeGreaterThan(before)
    );
  });
});
