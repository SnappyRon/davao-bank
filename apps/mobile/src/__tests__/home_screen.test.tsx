import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchTransactionHistory,
  fetchUserProfile,
  fetchHealthCheck,
  spacing,
  type AccountBalance,
} from '@davao-bank/shared';
import { KADA_SIZE } from '../components/FloatingKada';

const mockNavigate = jest.fn();

// The latest focus callback, so a test can simulate the screen regaining focus.
let mockFocusCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    // Like the real hook, it runs on first focus (mount).
    useFocusEffect: (callback: () => void) => {
      mockFocusCallback = callback;
      useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Per-table results for supabase.from(...) chains (requests, schedules, FX).
const mockTables: Record<string, { data?: unknown; error: unknown; count?: number }> = {};

const defaultSecuritySettings = {
  daily_transfer_limit_centavos: 5_000_000,
  spent_today_centavos: 0,
  remaining_today_centavos: 5_000_000,
  locked: false,
};

const mockRpc = jest.fn(async (_fn?: string, _params?: unknown) => ({
  data: defaultSecuritySettings,
  error: null,
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } } })),
    },
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
    from: (table: string) => {
      const result = mockTables[table] ?? { data: [], error: null, count: 0 };
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit']) {
        builder[method] = () => builder;
      }
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
  },
}));

let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: mockHideBalance, toggleHideBalance: jest.fn() }),
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchUserProfile: jest.fn(),
    fetchAccountBalances: jest.fn(),
    fetchTransactionHistory: jest.fn(),
    fetchHealthCheck: jest.fn(),
  };
});

import { HomeScreen } from '../screens/HomeScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

function account(overrides: Partial<AccountBalance>): AccountBalance {
  return {
    account_id: 'acc-1',
    user_id: 'usr-1',
    account_number: '1078958921',
    type: 'savings',
    currency: 'PHP',
    status: 'active',
    balance: 1234567,
    ledger_entry_count: 1,
    last_activity_at: null,
    ...overrides,
  };
}

const savings = account({});
const checking = account({
  account_id: 'acc-2',
  account_number: '1078957943',
  type: 'checking',
  balance: 50000,
});

/** "YYYY-MM-DD" for `daysAgo` days before today (local time). */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fxRow(rateDate: string, rate: number) {
  return { base: 'USD', quote: 'PHP', rate, rate_date: rateDate };
}

describe('HomeScreen (7B.1)', () => {
  // Let the rest of a load (requests, schedules, FX, health) finish inside
  // act before the next test renders, so updates never overlap tests.
  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
    mockRpc.mockImplementation(async (_fn?: string, _params?: unknown) => ({
      data: defaultSecuritySettings,
      error: null,
    }));
    for (const key of Object.keys(mockTables)) delete mockTables[key];
    jest.mocked(fetchUserProfile).mockResolvedValue({
      data: { id: 'usr-1', full_name: 'Juan Dela Cruz', status: 'active' },
      error: null,
    } as never);
    jest.mocked(fetchTransactionHistory).mockResolvedValue({ data: [], error: null });
    jest.mocked(fetchHealthCheck).mockResolvedValue({ data: null, error: null } as never);
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [savings], error: null });
  });

  it('shows "Balance unavailable" with Try again, and no ₱0.00, when the balance load fails', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValueOnce({
      data: null,
      error: 'network request failed',
    });

    await render(<HomeScreen />);

    expect(await screen.findByText('Balance unavailable')).toBeTruthy();
    expect(screen.queryByText('₱0.00')).toBeNull();
    expect(screen.queryByText(/network request failed/)).toBeNull();

    // Retry loads again and shows the real balance.
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₱12,345.67')).toBeTruthy();
    expect(screen.queryByText('Balance unavailable')).toBeNull();
    expect(fetchAccountBalances).toHaveBeenCalledTimes(2);
  });

  it('opens the account picker from the pill and switches the displayed account', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [savings, checking],
      error: null,
    });

    await render(<HomeScreen />);

    expect(await screen.findByText('Savings •• 8921')).toBeTruthy();
    expect(screen.getByText('₱12,345.67')).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', { name: 'Savings •• 8921. Change account' })
    );
    expect(await screen.findByText('Choose account')).toBeTruthy();

    const checkingRow = screen.getByRole('button', { name: 'Checking •• 7943, ₱500.00' });
    fireEvent.press(checkingRow);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Checking •• 7943. Change account' })
      ).toBeTruthy()
    );
    // The card now shows the checking balance as the main amount.
    expect(
      screen.queryByRole('button', { name: 'Savings •• 8921. Change account' })
    ).toBeNull();
  });

  it('shows "All accounts" only with 2+ accounts', async () => {
    await render(<HomeScreen />);
    expect(await screen.findByText('₱12,345.67')).toBeTruthy();
    expect(screen.queryByText(/All accounts/)).toBeNull();
    // A single account has no picker to open.
    expect(screen.queryByRole('button', { name: /Change account/ })).toBeNull();
  });

  it('sums "All accounts" with 2+ accounts', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [savings, checking],
      error: null,
    });
    await render(<HomeScreen />);
    expect(await screen.findByText('All accounts ₱12,845.67')).toBeTruthy();
  });

  it('masks "All accounts" and the balance when balances are hidden', async () => {
    mockHideBalance = true;
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [savings, checking],
      error: null,
    });
    await render(<HomeScreen />);
    expect(await screen.findByText('All accounts ₱••••••')).toBeTruthy();
    expect(screen.getByLabelText('All accounts, amount hidden')).toBeTruthy();
    expect(screen.queryByText('All accounts ₱12,845.67')).toBeNull();
    expect(screen.queryByText('₱12,345.67')).toBeNull();
  });

  it('hides Coming up when there are no scheduled payments', async () => {
    mockTables.scheduled_payments = { data: [], error: null };
    await render(<HomeScreen />);
    expect(await screen.findByText('₱12,345.67')).toBeTruthy();
    expect(screen.queryByText('Coming up')).toBeNull();
  });

  it('shows Coming up rows dated like "Nov 10 · Monthly" when items exist', async () => {
    mockTables.scheduled_payments = {
      data: [
        {
          id: 'sch-1',
          kind: 'transfer',
          note: 'Rent',
          amount: 500000,
          frequency: 'monthly',
          next_run_date: '2026-11-10',
          status: 'active',
        },
      ],
      error: null,
    };
    await render(<HomeScreen />);
    expect(await screen.findByText('Coming up')).toBeTruthy();
    expect(screen.getByText('Nov 10 · Monthly')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', { name: 'Rent, Nov 10 · Monthly, ₱5,000.00' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('ScheduledPayments');
  });

  it('shows "Not updated since" when the latest FX rate is more than 3 days old', async () => {
    const stale = isoDaysAgo(5);
    mockTables.fx_rates = {
      data: [fxRow(stale, 63.94), fxRow(isoDaysAgo(6), 63.8)],
      error: null,
    };
    await render(<HomeScreen />);
    expect(await screen.findByText('USD/PHP ₱63.94')).toBeTruthy();
    expect(screen.getByText(/^Not updated since [A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy();
  });

  it('shows the reference-rate date when the FX rate is fresh', async () => {
    mockTables.fx_rates = {
      data: [fxRow(isoDaysAgo(1), 63.94), fxRow(isoDaysAgo(2), 63.8)],
      error: null,
    };
    await render(<HomeScreen />);
    expect(await screen.findByText('USD/PHP ₱63.94')).toBeTruthy();
    expect(screen.getByText(/^[A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy();
    expect(screen.queryByText(/Reference rate/)).toBeNull();
    expect(screen.queryByText(/Not updated since/)).toBeNull();
  });

  it.each([
    ['Transfer', 'Transfer'],
    ['Pay bills', 'PayBills'],
    ['QR', 'QRHub'],
    ['Add money', 'AddMoney'],
    ['Cash out', 'CashOut'],
    ['Schedule', 'ScheduledPayments'],
  ])('action tile "%s" opens %s', async (label, route) => {
    await render(<HomeScreen />);
    await screen.findByText('₱12,345.67');
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(mockNavigate).toHaveBeenLastCalledWith(route);
  });

  it('shows "Balance unavailable" (not "No account yet") when there is no signed-in user', async () => {
    const { supabase } = jest.requireMock('../lib/supabase');
    jest.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Auth session missing' },
    });
    await render(<HomeScreen />);
    expect(await screen.findByText('Balance unavailable')).toBeTruthy();
    expect(screen.queryByText('No account yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(fetchAccountBalances).not.toHaveBeenCalled();
  });

  it('defaults to the savings account whatever order the rows come in', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [checking, savings],
      error: null,
    });
    await render(<HomeScreen />);
    expect(
      await screen.findByRole('button', { name: 'Savings •• 8921. Change account' })
    ).toBeTruthy();
  });

  it('keeps the chosen account after a focus reload', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [savings, checking],
      error: null,
    });
    await render(<HomeScreen />);
    fireEvent.press(
      await screen.findByRole('button', { name: 'Savings •• 8921. Change account' })
    );
    fireEvent.press(
      await screen.findByRole('button', { name: 'Checking •• 7943, ₱500.00' })
    );
    await screen.findByRole('button', { name: 'Checking •• 7943. Change account' });

    await act(async () => {
      mockFocusCallback?.();
    });

    await waitFor(() => expect(fetchAccountBalances).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('button', { name: 'Checking •• 7943. Change account' })
    ).toBeTruthy();
  });

  it('loads once on mount', async () => {
    await render(<HomeScreen />);
    await screen.findByText('₱12,345.67');
    expect(fetchAccountBalances).toHaveBeenCalledTimes(1);
  });

  it('shows an activity error with Try again instead of "No activity yet"', async () => {
    jest.mocked(fetchTransactionHistory).mockResolvedValueOnce({
      data: null,
      error: 'network request failed',
    });
    await render(<HomeScreen />);
    expect(await screen.findByText('Activity unavailable')).toBeTruthy();
    expect(screen.queryByText('No activity yet')).toBeNull();
    // The balance still loaded.
    expect(screen.getByText('₱12,345.67')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No activity yet')).toBeTruthy();
    expect(screen.queryByText('Activity unavailable')).toBeNull();
  });

  it('does not show "Balance unavailable" when the dev health check throws', async () => {
    jest.mocked(fetchHealthCheck).mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await render(<HomeScreen />);
    expect(await screen.findByText('₱12,345.67')).toBeTruthy();
    await waitFor(() => expect(fetchHealthCheck).toHaveBeenCalled());
    expect(screen.queryByText('Balance unavailable')).toBeNull();
    warn.mockRestore();
  });

  it('ignores a stale load that finishes after a newer one', async () => {
    let resolveFirst: (v: { data: AccountBalance[]; error: null }) => void = () => {};
    jest
      .mocked(fetchAccountBalances)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ data: [savings], error: null });
    await render(<HomeScreen />);
    await act(async () => {
      mockFocusCallback?.();
    });
    expect(await screen.findByText('₱12,345.67')).toBeTruthy();

    await act(async () => {
      resolveFirst({ data: [account({ balance: 100 })], error: null });
    });
    expect(screen.getByText('₱12,345.67')).toBeTruthy();
    expect(screen.queryByText('₱1.00')).toBeNull();
  });

  it('refetches Currency Watch on a focus reload', async () => {
    const { supabase } = jest.requireMock('../lib/supabase');
    const fromSpy = jest.spyOn(supabase, 'from');
    await render(<HomeScreen />);
    await screen.findByText('₱12,345.67');
    const fxCalls = () => fromSpy.mock.calls.filter(([t]) => t === 'fx_rates').length;
    await waitFor(() => expect(fxCalls()).toBe(1));
    await act(async () => {
      mockFocusCallback?.();
    });
    await waitFor(() => expect(fxCalls()).toBe(2));
    fromSpy.mockRestore();
  });

  describe('Bantay indicator (8F item 5)', () => {
    it('shows one calm watching row under the balance and opens Bantay', async () => {
      await render(<HomeScreen />);
      await screen.findByText('₱12,345.67');

      const chip = await screen.findByRole('button', {
        name: 'Bantay is watching your account',
      });
      // One calm indicator row plus the Home-only floating Kada widget.
      expect(
        screen.getAllByRole('button', { name: 'Bantay is watching your account' })
      ).toHaveLength(1);
      expect(screen.getByTestId('floating-kada')).toBeTruthy();
      await fireEvent.press(chip);
      expect(mockNavigate).toHaveBeenCalledWith('BantaySecurity');
    });

    it('replaces the old banner with one locked row', async () => {
      mockRpc.mockImplementation(async (fn?: string) => ({
        data: {
          ...defaultSecuritySettings,
          locked: fn === 'get_security_settings',
        },
        error: null,
      }));

      await render(<HomeScreen />);
      await screen.findByText('₱12,345.67');
      const chip = await screen.findByRole('button', {
        name: 'Account locked — Unlock in Bantay',
      });
      expect(
        screen.getAllByRole('button', { name: 'Account locked — Unlock in Bantay' })
      ).toHaveLength(1);
      await fireEvent.press(chip);
      expect(mockNavigate).toHaveBeenCalledWith('BantaySecurity');
    });

    it('shows a new-alert row when an open high security event exists', async () => {
      mockTables.security_events = { data: [{ id: 'evt-high' }], error: null };

      await render(<HomeScreen />);
      await screen.findByText('₱12,345.67');
      const chip = await screen.findByRole('button', {
        name: 'Check Bantay: new alert',
      });
      expect(screen.queryByText('Bantay is watching your account')).toBeNull();
      await fireEvent.press(chip);
      expect(mockNavigate).toHaveBeenCalledWith('BantaySecurity');
    });
  });

  it('shows More services without a Simulation badge and reserves the Kada lane', async () => {
    await render(<HomeScreen />);
    await screen.findByText('₱12,345.67');

    const row = screen.getByTestId('home-more-services-row');
    expect(row.props.accessibilityLabel).toBe(
      'More services, FX converter, requests and calculators'
    );
    expect(screen.queryByText('Simulation')).toBeNull();
    expect(row.props.style).toEqual(
      expect.objectContaining({ paddingRight: KADA_SIZE + spacing.base })
    );
  });
});
