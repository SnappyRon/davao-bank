import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetchAccountBalances, fetchTransactionHistory } from '@davao-bank/shared';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: undefined }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useIsFocused: () => true,
    usePreventRemove: jest.fn(),
  };
});
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
  },
}));

let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: mockHideBalance }),
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchTransactionHistory: jest.fn(),
    fetchAccountBalances: jest.fn(),
  };
});

import {
  MonthlySummaryScreen,
  formatMonthIso,
  shiftMonth,
} from '../screens/MonthlySummaryScreen';
import { ActivityScreen } from '../screens/ActivityScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_ROWS = [
  { category: 'money_in', total_centavos: 1_500_000, count: 3 },
  { category: 'transfers_out', total_centavos: 400_000, count: 2 },
  { category: 'bills', total_centavos: 250_000, count: 1 },
  { category: 'cash_out', total_centavos: 100_000, count: 1 },
  { category: 'adjustments', total_centavos: 50_000, count: 1 },
];

describe('MonthlySummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
    mockRpc.mockResolvedValue({ data: SAMPLE_ROWS, error: null });
  });

  it('shows loading skeleton while fetching monthly summary', async () => {
    let resolveRpc!: (v: unknown) => void;
    mockRpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRpc = resolve;
      })
    );
    await render(<MonthlySummaryScreen />);
    expect(screen.getByTestId('monthly-summary-loading')).toBeTruthy();

    await act(async () => {
      resolveRpc({ data: SAMPLE_ROWS, error: null });
    });
    expect(await screen.findByText('By category')).toBeTruthy();
  });

  it('shows empty state when the selected month has no activity', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await render(<MonthlySummaryScreen />);
    expect(await screen.findByText('No activity this month')).toBeTruthy();
  });

  it('shows error state and recovers on Try again', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: { message: 'network request failed' },
    });
    await render(<MonthlySummaryScreen />);
    expect(await screen.findByText('Summary unavailable')).toBeTruthy();

    mockRpc.mockResolvedValueOnce({ data: SAMPLE_ROWS, error: null });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('By category')).toBeTruthy();
  });

  it('renders totals, bars, counts, and switches to the previous month', async () => {
    const now = new Date();
    const currentIso = formatMonthIso(now.getFullYear(), now.getMonth());
    const prev = shiftMonth({ year: now.getFullYear(), month: now.getMonth() }, -1);
    const prevIso = formatMonthIso(prev.year, prev.month);

    await render(<MonthlySummaryScreen />);
    expect(await screen.findByText('By category')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('get_monthly_summary', { p_month: currentIso });

    // Money in = ₱15,000.00; Money out = ₱4,000 + ₱2,500 + ₱1,000 = ₱7,500.00
    expect(screen.getAllByText('₱15,000.00')).toHaveLength(2);
    expect(screen.getByText('₱7,500.00')).toBeTruthy();
    expect(screen.getByText('₱4,000.00')).toBeTruthy();
    expect(screen.getByText('₱2,500.00')).toBeTruthy();
    expect(screen.getByText('₱1,000.00')).toBeTruthy();
    expect(screen.getByText('₱500.00')).toBeTruthy();
    expect(screen.getByText('3 transactions')).toBeTruthy();
    expect(screen.getByText('2 transactions')).toBeTruthy();
    expect(screen.getByTestId('summary-bar-money_in')).toBeTruthy();
    expect(screen.getByTestId('summary-bar-bills')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('get_monthly_summary', { p_month: prevIso })
    );
  });

  it('masks all totals when hideBalance is true', async () => {
    mockHideBalance = true;
    await render(<MonthlySummaryScreen />);
    await screen.findByText('By category');
    expect(screen.getAllByText('₱••••••')).toHaveLength(7);
    expect(screen.queryByText('₱15,000.00')).toBeNull();
    expect(screen.queryByText('₱7,500.00')).toBeNull();
  });

  it('opens MonthlySummary from ActivityScreen', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [], error: null });
    jest.mocked(fetchTransactionHistory).mockResolvedValue({ data: [], error: null });
    await render(<ActivityScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Monthly summary' }));
    expect(mockNavigate).toHaveBeenCalledWith('MonthlySummary');
  });
});
