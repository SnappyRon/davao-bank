import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchTransactionHistory,
  type AccountBalance,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
// The latest focus callback, so a test can simulate the tab regaining focus.
let mockFocusCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (callback: () => void) => {
      mockFocusCallback = callback;
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
    ledger_entry_id: 'le-2',
    transaction_id: 'tx-2',
    counterparty_account_number: '1033335555',
    reference: 'Groceries',
  }),
  tx({
    ledger_entry_id: 'le-3',
    transaction_id: 'tx-3',
    account_id: 'acc-c',
    account_number: '1011114455',
    counterparty_account_number: '1044446666',
    reference: 'Lunch',
  }),
];

describe('ActivityScreen (7B.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchAccountBalances as jest.Mock).mockResolvedValue({
      data: accounts,
      error: null,
    });
    (fetchTransactionHistory as jest.Mock).mockResolvedValue({
      data: history,
      error: null,
    });
  });

  it('prefixes rows with the account and masks counterparties', async () => {
    await render(<ActivityScreen />);
    expect(await screen.findByText('Savings · To •• 7943 · 2:41 AM')).toBeTruthy();
    expect(screen.getByText('Checking · To •• 6666 · 2:41 AM')).toBeTruthy();
    expect(screen.queryByText(/1022227943/)).toBeNull();
  });

  it('searches by note', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');

    await fireEvent.changeText(screen.getByLabelText('Search activity'), 'groc');

    expect(screen.getByText('Sent to •• 5555')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();
    expect(screen.queryByText('Sent to •• 6666')).toBeNull();
  });

  it('searches by counterparty account digits', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');

    await fireEvent.changeText(screen.getByLabelText('Search activity'), '6666');

    expect(screen.getByText('Sent to •• 6666')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();
  });

  it('shows "No matches" when the search finds nothing', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');
    await fireEvent.changeText(screen.getByLabelText('Search activity'), 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('filters by account with 36 pt chips and compact account selector', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');

    // Tap compact account selector to open AccountPickerSheet
    await fireEvent.press(screen.getByRole('button', { name: 'All accounts' }));
    const accountRow = screen.getByRole('button', { name: /Checking •• 4455/ });
    await fireEvent.press(accountRow);

    // List is filtered to Checking transactions
    expect(screen.getByText('Sent to •• 6666')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();

    // Active removable chip is shown and is 36 pt tall
    const chip = screen.getByRole('button', {
      name: 'Remove Checking •• 4455 filter',
    });
    expect(chip).toHaveStyle({ minHeight: 36 });

    // Tap active chip to remove filter
    await fireEvent.press(chip);
    expect(screen.getByText('Sent to •• 7943')).toBeTruthy();
  });

  it('opens the receipt when a row is tapped', async () => {
    await render(<ActivityScreen />);
    await fireEvent.press(await screen.findByText('Sent to •• 7943'));
    expect(mockNavigate).toHaveBeenCalledWith('Receipt', {
      transactionId: 'tx-1',
      accountId: 'acc-s',
    });
  });

  it('shows the load error with Try again (never a fake empty state) and retries', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });
    await render(<ActivityScreen />);

    expect(await screen.findByText('Activity unavailable')).toBeTruthy();
    expect(screen.queryByText('No activity yet')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByText('Sent to •• 7943')).toBeTruthy();
    });
    expect(fetchTransactionHistory).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state copy when there is no activity', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [],
      error: null,
    });
    await render(<ActivityScreen />);
    expect(await screen.findByText('No activity yet')).toBeTruthy();
    expect(
      screen.getByText('Money you send, receive and pay will show here.')
    ).toBeTruthy();
  });

  it('shows the reversal row with its original and the original as reversed', async () => {
    const originalId = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [
        tx({
          ledger_entry_id: 'le-r',
          transaction_id: 'rev-1',
          type: 'reversal',
          direction: 'credit',
          counterparty_account_number: null,
          reference: `Reversal of ${originalId}: wrong account`,
        }),
        tx({
          ledger_entry_id: 'le-o',
          transaction_id: originalId,
          counterparty_account_number: '1022228720',
          status: 'reversed',
        }),
      ],
      error: null,
    });
    await render(<ActivityScreen />);
    expect(await screen.findByText('Reversal · Transfer to •• 8720')).toBeTruthy();
    expect(screen.getByText('Reversed')).toBeTruthy();
  });

  it('digit search only for number-like queries; text with a stray digit stays text-only', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');

    await fireEvent.changeText(screen.getByLabelText('Search activity'), '•• 7943');
    expect(screen.getByText('Sent to •• 7943')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 5555')).toBeNull();

    // "lunch 5" is text: it must not match account digits containing 5.
    await fireEvent.changeText(screen.getByLabelText('Search activity'), 'lunch 5');
    expect(screen.getByText('No matches')).toBeTruthy();

    // 3+ digits inside text still search accounts.
    await fireEvent.changeText(screen.getByLabelText('Search activity'), 'acct 666');
    expect(screen.getByText('Sent to •• 6666')).toBeTruthy();
  });

  it('never matches or shows the billers account on bill payments', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [
        tx({
          ledger_entry_id: 'le-b',
          transaction_id: 'tx-b',
          type: 'bill_payment',
          counterparty_account_number: '9990001234',
          reference: null,
        }),
      ],
      error: null,
    });
    await render(<ActivityScreen />);
    expect(await screen.findByText('Bill payment')).toBeTruthy();
    expect(screen.getByText('Savings · 2:41 AM')).toBeTruthy();
    expect(screen.queryByText(/1234/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search activity'), '1234');
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('uses the bank credit wording for the adjustments chip and its empty text', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');
    await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Adjustments' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('No bank credits or debits yet.')).toBeTruthy();
  });

  it('keeps the accounts when a refresh fails to load them', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Savings · To •• 7943 · 2:41 AM');

    (fetchAccountBalances as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });
    await act(async () => {
      mockFocusCallback?.();
    });

    expect(screen.getByText('Savings · To •• 7943 · 2:41 AM')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'All accounts' }));
    expect(screen.getByRole('button', { name: /Checking •• 4455/ })).toBeTruthy();
  });

  it('falls back to all accounts when the chosen account disappears', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');
    await fireEvent.press(screen.getByRole('button', { name: 'All accounts' }));
    await fireEvent.press(screen.getByRole('button', { name: /Checking •• 4455/ }));
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();

    (fetchAccountBalances as jest.Mock).mockResolvedValueOnce({
      data: [accounts[0]],
      error: null,
    });
    await act(async () => {
      mockFocusCallback?.();
    });

    expect(await screen.findByText('Sent to •• 7943')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All accounts' })).toBeTruthy();
  });

  it('shows the refresh error above the empty state when the filtered list is empty', async () => {
    await render(<ActivityScreen />);
    await screen.findByText('Sent to •• 7943');
    await fireEvent.changeText(screen.getByLabelText('Search activity'), 'zzz');

    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });
    await act(async () => {
      mockFocusCallback?.();
    });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('ignores an older load that resolves after a newer one', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    (fetchTransactionHistory as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ data: [history[1]], error: null });

    await render(<ActivityScreen />);
    await act(async () => {
      mockFocusCallback?.();
    });
    expect(await screen.findByText('Sent to •• 5555')).toBeTruthy();

    await act(async () => {
      resolveFirst({ data: [history[0]], error: null });
    });
    expect(screen.getByText('Sent to •• 5555')).toBeTruthy();
    expect(screen.queryByText('Sent to •• 7943')).toBeNull();
  });
});
