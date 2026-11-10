import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  fetchTransactionHistory,
  RECEIPT_NOT_FOUND_MESSAGE,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

const mockGoBack = jest.fn();
const mockRouteParams = {
  transactionId: '8f043910-1a2b-4c3d-8e9f-0123456789ab',
  accountId: 'acc-001',
};

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

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => {
  const actual = jest.requireActual('../components/Toast');
  return { ...actual, useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }) };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchTransactionHistory: jest.fn(),
  };
});

import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ReceiptScreen, receiptReference } from '../screens/ReceiptScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const sampleTx: TransactionHistoryItem = {
  ledger_entry_id: 'led-001',
  transaction_id: '8f043910-1a2b-4c3d-8e9f-0123456789ab',
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

  it('renders amount, badge and the spec rows (full account number on receipts)', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });

    await render(<ReceiptScreen />);

    expect(await screen.findByText('Sent to •• 3210')).toBeTruthy();
    expect(screen.getByText('−₱250.00')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Date & time')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('Note')).toBeTruthy();
    expect(screen.getByText('DB-TEST-REF')).toBeTruthy();
    expect(screen.getByText('Reference no.')).toBeTruthy();
    expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
    // The full UUID only appears in Share receipt, never on screen.
    expect(screen.queryByText(sampleTx.transaction_id)).toBeNull();
    expect(screen.queryByText('Transaction ID')).toBeNull();

    const doneBtn = screen.getByRole('button', { name: 'Done' });
    fireEvent.press(doneBtn);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('formats the reference as DB-XXXX-XXXX from the first 8 hex characters', () => {
    expect(receiptReference('8f043910-1a2b-4c3d-8e9f-0123456789ab')).toBe('DB-8F04-3910');
    expect(receiptReference('abcdef12-0000-0000-0000-000000000000')).toBe('DB-ABCD-EF12');
  });

  it('copies the reference with the copy button and confirms with a toast', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });
    await render(<ReceiptScreen />);
    await screen.findByText('DB-8F04-3910');

    await fireEvent.press(screen.getByRole('button', { name: 'Copy reference number' }));

    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('DB-8F04-3910');
    });
    expect(mockToastShow).toHaveBeenCalledWith('Reference copied');
  });

  it('shares a text receipt that includes the full transaction id', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });
    await render(<ReceiptScreen />);
    await screen.findByText('DB-8F04-3910');

    await fireEvent.press(screen.getByRole('button', { name: 'Share receipt' }));

    await waitFor(() => {
      expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
    const [uri, text] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(text).toContain(`Transaction ID: ${sampleTx.transaction_id}`);
    expect(text).toContain('Reference no.: DB-8F04-3910');
    expect(text).toContain('Amount: ₱250.00');
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][0]).toBe(uri);
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ mimeType: 'text/plain' })
    );
  });

  it('shows a reversed original struck through with a neutral Reversed badge', async () => {
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [{ ...sampleTx, status: 'reversed' }],
      error: null,
    });
    await render(<ReceiptScreen />);
    const amount = await screen.findByText('−₱250.00');
    expect(screen.getByText('Reversed')).toBeTruthy();
    expect(amount).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('masks the amount when hideBalance is enabled (screen and shared text)', async () => {
    mockHideBalance = true;
    (fetchTransactionHistory as jest.Mock).mockResolvedValueOnce({
      data: [sampleTx],
      error: null,
    });

    await render(<ReceiptScreen />);

    expect(await screen.findByText('Sent to •• 3210')).toBeTruthy();
    expect(screen.getByText('₱••••••')).toBeTruthy();
    expect(screen.queryByText('−₱250.00')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Share receipt' }));
    await waitFor(() => {
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    });
    const text = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
    expect(text).toContain('Amount: Hidden');
    expect(text).not.toContain('₱250.00');
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
      expect(screen.getByText('Sent to •• 3210')).toBeTruthy();
    });
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('DB-TEST-REF')).toBeTruthy();
  });
});
