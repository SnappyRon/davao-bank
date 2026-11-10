jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { TransferScreen } from '../screens/TransferScreen';
import {
  executeTransfer,
  generateIdempotencyKey,
  fetchAccountBalances,
} from '@davao-bank/shared';
import type { AccountBalance } from '@davao-bank/shared';

const mockGoBack = jest.fn();
const mockRouteParams = {
  recipientAccount: '1099999999',
  amountCentavos: 50000,
  note: 'Lunch split',
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, replace: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [] }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock executeTransfer
jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchAccountBalances: jest.fn(),
    generateIdempotencyKey: jest.fn(actual.generateIdempotencyKey),
    executeTransfer: jest.fn().mockResolvedValue({
      data: {
        id: 'tx-mock-12345678',
        transaction_id: 'tx-mock-12345678',
        amount: 50000,
        status: 'completed',
        idempotent_replay: false,
      },
      error: null,
    }),
  };
});

// Mock settings context
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: jest.fn().mockResolvedValue({ success: true }),
  }),
}));

describe('TransferScreen - F1 State & Receipt Guarantees', () => {
  const initialAccounts: AccountBalance[] = [
    {
      account_id: 'acc-1111-2222',
      user_id: 'user-test',
      account_number: '1012345678',
      type: 'savings',
      currency: 'PHP',
      status: 'active',
      balance: 5000000, // ₱50,000.00
      ledger_entry_count: 5,
      last_activity_at: null,
    },
    {
      account_id: 'acc-3333-4444',
      user_id: 'user-test',
      account_number: '1087654321',
      type: 'checking',
      currency: 'PHP',
      status: 'active',
      balance: 2000000, // ₱20,000.00
      ledger_entry_count: 2,
      last_activity_at: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: initialAccounts, error: null });
  });

  it('stays on success step and retains refreshed "Balance now" when loaded accounts update after transfer', async () => {
    // 1. Render TransferScreen open with QR prefill with amount (which auto-navigates to review)
    const { rerender } = await render(<TransferScreen />);

    // Should land on Review step directly due to valid QR prefill with amount
    expect(await screen.findByText('Transfer · Review')).toBeTruthy();

    let resolveAccounts!: (
      value: Awaited<ReturnType<typeof fetchAccountBalances>>
    ) => void;
    jest.mocked(fetchAccountBalances).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccounts = resolve;
        })
    );

    // Confirm transfer
    await act(async () => {
      fireEvent.press(screen.getByText('Authorize Transfer'));
    });

    // Should now be on Success step
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(screen.getByText('Balance now')).toBeTruthy();

    const keyCalls = jest.mocked(generateIdempotencyKey).mock.calls.length;
    const submittedKey = jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key;
    await rerender(<TransferScreen />);
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(generateIdempotencyKey).toHaveBeenCalledTimes(keyCalls);
    expect(executeTransfer).toHaveBeenCalledTimes(1);
    expect(jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key).toBe(
      submittedKey
    );

    // 2. Resolve the screen-owned account refresh after success
    // Source account balance decreased from ₱50,000.00 to ₱49,500.00 (4,950,000 centavos)
    const updatedAccounts: AccountBalance[] = [
      {
        ...initialAccounts[0],
        balance: 4950000, // Refreshed balance
      },
      initialAccounts[1],
    ];

    await act(async () => {
      resolveAccounts({ data: updatedAccounts, error: null });
      await rerender(<TransferScreen />);
    });

    // CRITICAL INVARIANT: Screen must STAY on success screen, NOT jump back to review or recipient
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(screen.getByText('Balance now')).toBeTruthy();
    expect(screen.getByText('₱49,500.00')).toBeTruthy();
    expect(screen.queryByText('Transfer · Review')).toBeNull();
    expect(screen.queryByText('Transfer · Recipient')).toBeNull();
  });
  it('waits for accounts, maps load errors and retries before enabling transfer', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValueOnce({ data: null, error: 'Network request failed' });
    await render(<TransferScreen />);
    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Authorize Transfer' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Transfer · Review')).toBeTruthy();
    expect(fetchAccountBalances).toHaveBeenCalledTimes(2);
    expect(executeTransfer).not.toHaveBeenCalled();
  });

  it.each([
    ['123', 'Invalid QR recipient account: must be exactly 10 digits.'],
    ['1012345678', 'Cannot transfer to the same account'],
  ])(
    'rejects QR prefill recipient %s after loading the source account',
    async (recipient, message) => {
      const previousRecipient = mockRouteParams.recipientAccount;
      mockRouteParams.recipientAccount = recipient;
      try {
        await render(<TransferScreen />);
        expect(await screen.findByText(message)).toBeTruthy();
        expect(screen.getByText('Transfer · Recipient')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Authorize Transfer' })).toBeNull();
        expect(executeTransfer).not.toHaveBeenCalled();
      } finally {
        mockRouteParams.recipientAccount = previousRecipient;
      }
    }
  );

  it('shows checking status and retains the request key after a dropped response', async () => {
    jest.mocked(executeTransfer).mockClear();
    jest
      .mocked(executeTransfer)
      .mockResolvedValueOnce({ data: null, error: 'TypeError: Network request failed' });
    await render(<TransferScreen />);
    await fireEvent.press(await screen.findByText('Authorize Transfer'));
    await waitFor(() => expect(screen.getByText('Checking status…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Transfer Sent')).toBeTruthy(), {
      timeout: 3000,
    });
    const calls = jest.mocked(executeTransfer).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(screen.queryByText('Checking status…')).toBeNull();
  });
});
