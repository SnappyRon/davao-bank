import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchTransactionHistory,
  type AccountBalance,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockRouteParams: { accountId?: string } | undefined;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, setParams: mockSetParams }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (callback: () => void) => {
      useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: false }),
}));
jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchTransactionHistory: jest.fn(),
    fetchAccountBalances: jest.fn(),
  };
});

import { ActivityScreen } from '../screens/ActivityScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const accounts: AccountBalance[] = [
  {
    account_id: 'acc-s',
    user_id: 'usr-1',
    account_number: '1011118921',
    type: 'savings',
    balance: 100000,
  } as AccountBalance,
  {
    account_id: 'acc-c',
    user_id: 'usr-1',
    account_number: '1011114455',
    type: 'checking',
    balance: 50000,
  } as AccountBalance,
];

function tx(overrides: Partial<TransactionHistoryItem>): TransactionHistoryItem {
  return {
    ledger_entry_id: 'le',
    transaction_id: 'tx',
    account_id: 'acc-s',
    account_number: '1011118921',
    counterparty_account_number: '1022227943',
    direction: 'debit',
    amount: 50000,
    signed_amount: -50000,
    type: 'transfer',
    status: 'completed',
    reference: null,
    created_at: '2026-11-10T02:41:00',
    ...overrides,
  };
}

const history = [
  tx({ ledger_entry_id: 'le-1', transaction_id: 'tx-1', reference: 'Rent' }),
  tx({
    ledger_entry_id: 'le-3',
    transaction_id: 'tx-3',
    account_id: 'acc-c',
    account_number: '1011114455',
    counterparty_account_number: '1044446666',
    reference: 'Lunch',
  }),
];

describe('Activity opened from Account detail ("See all")', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    (fetchAccountBalances as jest.Mock).mockResolvedValue({
      data: accounts,
      error: null,
    });
    (fetchTransactionHistory as jest.Mock).mockResolvedValue({
      data: history,
      error: null,
    });
  });

  it('filters to the account in the accountId route param', async () => {
    mockRouteParams = { accountId: 'acc-c' };
    await render(<ActivityScreen />);

    expect(await screen.findByText('Sent to •• 6666')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();
    expect(screen.getByRole('button', { name: 'Checking •• 4455' })).toBeTruthy();
    // The param is consumed so the next "See all" applies again.
    expect(mockSetParams).toHaveBeenCalledWith({ accountId: undefined });
  });

  it('shows every account when there is no accountId param', async () => {
    await render(<ActivityScreen />);

    expect(await screen.findByText('Sent to •• 7943')).toBeTruthy();
    expect(screen.getByText('Sent to •• 6666')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All accounts' })).toBeTruthy();
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('falls back to all accounts when the param is not one of the user accounts', async () => {
    mockRouteParams = { accountId: 'acc-unknown' };
    await render(<ActivityScreen />);

    expect(await screen.findByText('Sent to •• 7943')).toBeTruthy();
    expect(screen.getByText('Sent to •• 6666')).toBeTruthy();
  });

  it('lets the user change or clear the filter after opening from Account detail', async () => {
    mockRouteParams = { accountId: 'acc-c' };
    await render(<ActivityScreen />);
    expect(await screen.findByText('Sent to •• 6666')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Checking •• 4455' }));
    await fireEvent.press(screen.getByRole('button', { name: /Savings •• 8921/ }));

    expect(await screen.findByText('Sent to •• 7943')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 6666')).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Remove Savings •• 8921 filter' })
    );
    expect(await screen.findByText('Sent to •• 6666')).toBeTruthy();
  });
});
