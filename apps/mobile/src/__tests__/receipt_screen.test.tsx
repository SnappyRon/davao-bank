import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  fetchTransactionHistory,
  RECEIPT_NOT_FOUND_MESSAGE,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

const mockGoBack = jest.fn();
const mockRouteParams = { transactionId: 'tx-001', accountId: 'acc-001' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-blur', () => ({
  BlurView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }),
    },
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
  };
});

import { ReceiptScreen } from '../screens/ReceiptScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const sampleTx: TransactionHistoryItem = {
  ledger_entry_id: 'led-001',
  transaction_id: 'tx-001',
  account_id: 'acc-001',
  account_number: '1234567890',
  counterparty_account_number: '9876543210',
  amount: 25000,
  signed_amount: -25000,
  type: 'transfer',
  status: 'completed',
  direction: 'debit',
  created_at: '2026-11-10T04:00:00.000Z',
  reference: 'DB-TEST-REF',
};

describe('ReceiptScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
  });

  it('renders successfully when transaction is found', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });

    await render(<ReceiptScreen />);

    expect(await screen.findByText('Transfer')).toBeTruthy();
    expect(screen.getByText('−₱250.00')).toBeTruthy();
    expect(screen.getByText('1234567890')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('DB-TEST-REF')).toBeTruthy();
    expect(screen.getByText('tx-001')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();

    const doneBtn = screen.getByRole('button', { name: 'Done' });
    expect(doneBtn).toBeTruthy();
    fireEvent.press(doneBtn);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('masks the amount when hideBalance is enabled', async () => {
    mockHideBalance = true;
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });

    await render(<ReceiptScreen />);

    expect(await screen.findByText('Transfer')).toBeTruthy();
    expect(screen.getByText('₱••••••')).toBeTruthy();
    expect(screen.queryByText('−₱250.00')).toBeNull();
  });

  it('shows not-found message without "Try again" button when transaction is missing', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await render(<ReceiptScreen />);

    expect(await screen.findByText(RECEIPT_NOT_FOUND_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows error and retries when "Try again" is pressed', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });

    await render(<ReceiptScreen />);

    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();

    const tryAgainBtn = screen.getByRole('button', { name: 'Try again' });
    expect(tryAgainBtn).toBeTruthy();

    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });

    fireEvent.press(tryAgainBtn);

    await waitFor(() => {
      expect(screen.getByText('Transfer')).toBeTruthy();
    });
    expect(screen.getByText('1234567890')).toBeTruthy();
    expect(screen.getByText('DB-TEST-REF')).toBeTruthy();
  });
});
