import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { ScheduledPayment } from '@davao-bank/shared';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-blur', () => ({
  BlurView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }),
    },
  },
}));

let mockHideBalance = false;
const mockConfirmBiometricPayment = jest.fn();

jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: mockHideBalance,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

import { ScheduledPaymentsScreen } from '../screens/ScheduledPaymentsScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const sampleSchedule: ScheduledPayment = {
  id: 'sched-001',
  owner_id: 'usr-1',
  from_account: 'acc-001',
  from_account_number: '1234567890',
  kind: 'transfer',
  to_account: 'acc-002',
  to_account_number: '9876543210',
  to_account_last4: '3210',
  biller_id: null,
  biller_name: null,
  biller_reference: null,
  amount: 50000,
  note: 'Monthly allowance',
  frequency: 'monthly',
  start_date: '2026-11-01',
  end_date: '2027-11-01',
  max_runs: 12,
  runs_done: 1,
  next_run_date: '2026-12-01',
  status: 'active',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

describe('ScheduledPaymentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
  });

  it('loads list of scheduled payments', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [sampleSchedule],
      error: null,
    });

    await render(<ScheduledPaymentsScreen />);

    expect(await screen.findByText('Transfer · •••• 3210')).toBeTruthy();
    expect(screen.getByText('Next: 2026-12-01')).toBeTruthy();
    expect(screen.getByText('−₱500.00')).toBeTruthy();
    expect(screen.getByText('monthly')).toBeTruthy();
  });

  it('shows empty state when no scheduled payments exist', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await render(<ScheduledPaymentsScreen />);

    expect(await screen.findByText('No scheduled payments')).toBeTruthy();
    expect(
      screen.getByText(
        'Set up recurring transfers or bill payments to manage your finances automatically.'
      )
    ).toBeTruthy();
  });

  it('shows load error and retries when "Try again" is pressed', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });

    await render(<ScheduledPaymentsScreen />);

    expect(await screen.findByText('You appear to be offline.')).toBeTruthy();

    const tryAgainBtn = screen.getByRole('button', { name: 'Try again' });
    expect(tryAgainBtn).toBeTruthy();

    mockRpc.mockResolvedValueOnce({
      data: [sampleSchedule],
      error: null,
    });

    fireEvent.press(tryAgainBtn);

    await waitFor(() => {
      expect(screen.getByText('Transfer · •••• 3210')).toBeTruthy();
    });
    expect(screen.getByText('Next: 2026-12-01')).toBeTruthy();
  });

  it('shows "Completed" badge and "Paid <date>" for completed schedules and sorts them below active ones', async () => {
    const completedSchedule: ScheduledPayment = {
      ...sampleSchedule,
      id: 'sched-002',
      status: 'completed',
      frequency: 'once',
      next_run_date: '2026-11-05',
      to_account_last4: '9999',
    };

    // Return completed schedule first in the API response
    mockRpc.mockResolvedValueOnce({
      data: [completedSchedule, sampleSchedule],
      error: null,
    });

    await render(<ScheduledPaymentsScreen />);

    // Active schedule should appear first even though completed came first in raw response
    const cards = await screen.findAllByRole('button', { name: /View schedule for/ });
    expect(cards).toHaveLength(2);

    expect(screen.getByText('Transfer · •••• 3210')).toBeTruthy();
    expect(screen.getByText('Next: 2026-12-01')).toBeTruthy();

    expect(screen.getByText('Transfer · •••• 9999')).toBeTruthy();
    expect(screen.getByText('Paid 2026-11-05')).toBeTruthy();
    expect(screen.queryByText('Next: 2026-11-05')).toBeNull();
    expect(screen.getByText('Completed')).toBeTruthy();

    // Tap completed schedule to view detail
    fireEvent.press(cards[1]);

    expect(await screen.findByText('Schedule Details')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.queryByText('Next Execution')).toBeNull();
  });
});
