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
  MAX_QR_AMOUNT_CENTAVOS,
  MAX_QR_NOTE_LENGTH,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import type { AccountBalance } from '@davao-bank/shared';

const mockToastShow = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
let mockRouteParams: RootStackParamList['Transfer'] = {
  recipientAccount: '1099999999',
  amountCentavos: 50000,
  note: 'Lunch split',
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, replace: mockReplace }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
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
const mockConfirmBiometricPayment = jest.fn();
let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: mockHideBalance,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

// 2+ accounts: a prefilled transfer starts on the source step (spec 7B.4).
async function chooseSource(name: RegExp = /^Savings •• 5678/) {
  await fireEvent.press(await screen.findByRole('button', { name }));
}

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
    jest.mocked(executeTransfer).mockClear();
    jest.mocked(executeTransfer).mockResolvedValue({
      data: {
        id: 'tx-mock-12345678',
        transaction_id: 'tx-mock-12345678',
        type: 'transfer',
        status: 'completed',
        amount: 50000,
        reference: 'Mobile Transfer',
        idempotency_key: 'tx-mock-12345678',
        created_at: '2026-11-25T10:00:00Z',
        idempotent_replay: false,
      },
      error: null,
    });
    mockHideBalance = false;
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    mockRouteParams = {
      recipientAccount: '1099999999',
      amountCentavos: 50000,
      note: 'Lunch split',
    };
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: initialAccounts, error: null });
  });

  it('stays on success step and retains refreshed "Balance now" when loaded accounts update after transfer', async () => {
    // 1. Render TransferScreen open with QR prefill with amount (which auto-navigates to review)
    const { rerender } = await render(<TransferScreen />);
    await chooseSource();

    // Should land on Review step directly due to valid QR prefill with amount
    expect(await screen.findByText("You're sending")).toBeTruthy();

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
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    });

    // Should now be on Success step
    expect(screen.getByText('Transfer sent')).toBeTruthy();
    expect(screen.getByText('DB-TXMO-CK12')).toBeTruthy();
    expect(screen.getByText('₱500.00')).toBeTruthy();
    expect(screen.queryByText('Balance now')).toBeNull();
    expect(screen.queryByText('Loading accounts…')).toBeNull();

    const keyCalls = jest.mocked(generateIdempotencyKey).mock.calls.length;
    const submittedKey = jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key;
    await rerender(<TransferScreen />);
    expect(screen.getByText('Transfer sent')).toBeTruthy();
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
    expect(screen.getByText('Transfer sent')).toBeTruthy();
    expect(screen.getByText('Balance now')).toBeTruthy();
    expect(screen.getByText('₱49,500.00')).toBeTruthy();
    expect(screen.queryByText("You're sending")).toBeNull();
    expect(screen.queryByText('Step 2 of 4')).toBeNull();
  });
  it('masks the refreshed balance and result amount when balances are hidden', async () => {
    mockHideBalance = true;
    await render(<TransferScreen />);
    await chooseSource();
    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));
    expect(await screen.findByRole('header', { name: 'Transfer sent' })).toBeTruthy();
    expect(await screen.findByText('Balance now')).toBeTruthy();
    expect(screen.queryByText('₱50,000.00')).toBeNull();
    expect(screen.queryByText('₱500.00')).toBeNull();
  });

  it('waits for accounts, maps load errors and retries before enabling transfer', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValueOnce({ data: null, error: 'Network request failed' });
    await render(<TransferScreen />);
    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Send ₱/ })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await chooseSource();
    expect(await screen.findByText("You're sending")).toBeTruthy();
    expect(fetchAccountBalances).toHaveBeenCalledTimes(2);
    expect(executeTransfer).not.toHaveBeenCalled();
  });

  it.each([
    ['123', 'Invalid QR recipient account: must be exactly 10 digits.'],
    ['1012345678', 'Cannot transfer to the same account'],
  ])(
    'rejects QR prefill recipient %s after loading the source account',
    async (recipient, message) => {
      const previousRecipient = mockRouteParams!.recipientAccount;
      mockRouteParams!.recipientAccount = recipient;
      try {
        await render(<TransferScreen />);
        // 2+ accounts: the same-account rule runs once the source is chosen
        // (the invalid number is rejected straight away).
        if (recipient === '1012345678') {
          expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
          expect(screen.queryByText(message)).toBeNull();
          await chooseSource();
        }
        expect(await screen.findByText(message)).toBeTruthy();
        expect(screen.getByText('Step 2 of 4')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Send ₱/ })).toBeNull();
        expect(executeTransfer).not.toHaveBeenCalled();
      } finally {
        mockRouteParams!.recipientAccount = previousRecipient;
      }
    }
  );

  it('opens Recipient with no params and replaces the page for Request money', async () => {
    mockRouteParams = undefined;
    await render(<TransferScreen />);
    // 2+ accounts: the source account picker comes first (spec 7B.4).
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('Send from')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    const requestMoney = await screen.findByRole('button', {
      name: 'Need to receive funds? Request money instead',
    });
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    fireEvent.press(requestMoney);
    expect(mockReplace).toHaveBeenCalledWith('QRHub', { initialTab: 'request' });
  });

  it.each([1.5, MAX_QR_AMOUNT_CENTAVOS + 1])(
    'opens Amount for invalid prefill amount %s',
    async (amountCentavos) => {
      mockRouteParams = {
        recipientAccount: '1099999999',
        amountCentavos,
        note: 'Drop this note too',
      };
      await render(<TransferScreen />);
      await chooseSource();
      expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
      expect(screen.getByLabelText('To •• 9999')).toBeTruthy();
      expect(screen.queryByDisplayValue('Drop this note too')).toBeNull();
      expect(executeTransfer).not.toHaveBeenCalled();
    }
  );

  it('drops overlength notes and opens Amount', async () => {
    mockRouteParams = {
      recipientAccount: '1099999999',
      amountCentavos: 50000,
      note: 'x'.repeat(MAX_QR_NOTE_LENGTH + 1),
    };
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    expect(screen.queryByDisplayValue(mockRouteParams.note!)).toBeNull();
    expect(executeTransfer).not.toHaveBeenCalled();
  });

  it('keeps success and omits balance without an alert when the refresh fails', async () => {
    await render(<TransferScreen />);
    await chooseSource();
    await screen.findByText("You're sending");
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValueOnce({ data: null, error: 'Network request failed' });
    fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    expect(await screen.findByText('Transfer sent')).toBeTruthy();
    await waitFor(() => expect(fetchAccountBalances).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Balance now')).toBeNull();
    expect(screen.queryByText('₱50,000.00')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('Loading accounts…')).toBeNull();
    expect(executeTransfer).toHaveBeenCalledTimes(1);
  });

  it('shows checking status and retains the request key after a dropped response', async () => {
    jest.mocked(executeTransfer).mockClear();
    jest
      .mocked(executeTransfer)
      .mockResolvedValueOnce({ data: null, error: 'TypeError: Network request failed' });
    await render(<TransferScreen />);
    await chooseSource();
    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));
    await waitFor(() => expect(screen.getByText('Checking status…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Transfer sent')).toBeTruthy(), {
      timeout: 3000,
    });
    const calls = jest.mocked(executeTransfer).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(screen.queryByText('Checking status…')).toBeNull();
  });

  it('shows "Done" when transfer is uncertain and closes sheet with Activity toast', async () => {
    jest.mocked(executeTransfer).mockClear();
    mockGoBack.mockClear();
    mockToastShow.mockClear();

    const dropped = { data: null, error: 'TypeError: Network request failed' };
    jest
      .mocked(executeTransfer)
      .mockResolvedValueOnce(dropped)
      .mockResolvedValueOnce(dropped)
      .mockResolvedValueOnce(dropped);

    await render(<TransferScreen />);
    await chooseSource();
    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));

    await waitFor(
      () =>
        expect(
          screen.getByText(
            'Status is not confirmed. Reconnect and authorize again to check the same transfer. Do not start a new transfer.'
          )
        ).toBeTruthy(),
      { timeout: 5000 }
    );

    const doneBtn = screen.getByRole('button', { name: 'Done' });
    expect(doneBtn).toBeTruthy();

    await fireEvent.press(doneBtn);
    expect(mockGoBack).toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith(
      'Check Activity to confirm your transfer status',
      'info'
    );
  });

  it('shows "Check status" when transfer is uncertain and reuses the same key', async () => {
    jest.mocked(executeTransfer).mockClear();

    const dropped = { data: null, error: 'TypeError: Network request failed' };
    jest
      .mocked(executeTransfer)
      .mockResolvedValueOnce(dropped)
      .mockResolvedValueOnce(dropped)
      .mockResolvedValueOnce(dropped)
      .mockResolvedValueOnce({
        data: {
          id: 'tx-recovered-1234',
          transaction_id: 'tx-recovered-1234',
          type: 'transfer',
          status: 'completed',
          amount: 50000,
          reference: 'Mobile Transfer',
          idempotency_key: 'tx-recovered-1234',
          created_at: '2026-11-25T10:00:00Z',
          idempotent_replay: false,
        },
        error: null,
      });

    await render(<TransferScreen />);
    await chooseSource();
    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));

    await waitFor(
      () =>
        expect(
          screen.getByText(
            'Status is not confirmed. Reconnect and authorize again to check the same transfer. Do not start a new transfer.'
          )
        ).toBeTruthy(),
      { timeout: 5000 }
    );

    const initialKey = jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key;
    const checkStatusBtn = screen.getByRole('button', { name: 'Check status' });
    expect(checkStatusBtn).toBeTruthy();

    await fireEvent.press(checkStatusBtn);
    expect(await screen.findByText('Transfer sent')).toBeTruthy();

    const calls = jest.mocked(executeTransfer).mock.calls;
    expect(calls[calls.length - 1][1].idempotency_key).toBe(initialKey);
  });

  // ---- Stage 7B.4: one sequence for every money flow ----

  it('shows the standard Review card: no sign, rows, fee and footnote', async () => {
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText("You're sending")).toBeTruthy();
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
    expect(screen.getByText('₱500.00')).toBeTruthy();
    expect(screen.queryByText('−₱500.00')).toBeNull();
    expect(screen.getByText('Savings •• 5678')).toBeTruthy();
    expect(screen.getByText('•• 9999')).toBeTruthy();
    expect(screen.getByText('Lunch split')).toBeTruthy();
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByText('₱49,500.00')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Simulated money — no real funds move.')).toBeTruthy();
    // Full recipient number never appears on Review.
    expect(screen.queryByText(/1099999999/)).toBeNull();
  });

  it('keeps the prompt and the RPC payload, and shows "Sending…" while busy', async () => {
    let resolveTransfer!: (v: unknown) => void;
    jest.mocked(executeTransfer).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTransfer = resolve;
        }) as never
    );
    await render(<TransferScreen />);
    await chooseSource();
    await screen.findByText("You're sending");
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeTruthy();
    // Authorize before money moves, with the sentence-case prompt and masked account.
    expect(mockConfirmBiometricPayment).toHaveBeenCalledWith({
      title: 'Authorize transfer',
      message: 'Confirm transfer of ₱500.00 to account •• 9999',
    });
    expect(mockConfirmBiometricPayment.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(executeTransfer).mock.invocationCallOrder[0]
    );
    expect(jest.mocked(executeTransfer).mock.calls[0][1]).toEqual({
      from_account: 'acc-1111-2222',
      to_account_number: '1099999999',
      amount: 50000,
      idempotency_key: expect.any(String),
      reference: 'Lunch split',
    });
    await act(async () => {
      resolveTransfer({
        data: { id: 'tx-1', transaction_id: 'tx-1', amount: 50000, status: 'completed' },
        error: null,
      });
    });
    expect(await screen.findByText('Transfer sent')).toBeTruthy();
  });

  it('does not move money when authorization is cancelled', async () => {
    mockConfirmBiometricPayment.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await render(<TransferScreen />);
    await chooseSource();
    await screen.findByText("You're sending");
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    });
    expect(executeTransfer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send ₱500.00' })).toBeTruthy();
  });

  it('pays from the account chosen in the first step (2+ accounts)', async () => {
    mockRouteParams = undefined;
    await render(<TransferScreen />);
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Other account' }));
    await fireEvent.changeText(
      screen.getByPlaceholderText('e.g. 1020441785'),
      '1099999999'
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    expect(screen.getByLabelText('To •• 9999')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '250');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Checking •• 4321')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱250.00' }));
    });
    expect(jest.mocked(executeTransfer).mock.calls[0][1]).toMatchObject({
      from_account: 'acc-3333-4444',
      amount: 25000,
    });
  });

  it('shows amount validation inline under the field', async () => {
    mockRouteParams = { recipientAccount: '1099999999' };
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Amount must be greater than ₱0.00')).toBeTruthy();
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
  });

  it('skips the account step with one account and names a scheduled commit', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [initialAccounts[0]], error: null });
    mockRouteParams = { recipientAccount: '1099999999' };
    await render(<TransferScreen />);
    expect(await screen.findByText('Step 2 of 3')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText("You're scheduling")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule ₱500.00' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change account/ })).toBeNull();
  });

  // ---- 7B.4 fix round ----

  it('starts a saved-recipient transfer on the source step, then the amount step with the nickname', async () => {
    mockRouteParams = { recipientAccount: '1099997943', recipientNickname: 'Mama' };
    await render(<TransferScreen />);
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
    await chooseSource(/^Checking •• 4321/);
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    expect(screen.getByLabelText('To Mama · •• 7943')).toBeTruthy();
  });

  it('shows recipient validation under the Account number field', async () => {
    mockRouteParams = undefined;
    await render(<TransferScreen />);
    await chooseSource();
    await fireEvent.press(screen.getByRole('button', { name: 'Saved' }));
    expect(
      screen.getByText(
        'No saved recipients yet. Enter their account number to send money.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter an account number' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Other account' }));
    expect(
      screen.getByText(
        "Send to any Davao Bank account. Transfers to other banks aren't available in this demo."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Please enter or select an account number')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1020441785'), '1');
    expect(screen.queryByText('Please enter or select an account number')).toBeNull();
  });

  it('Review From change to the recipient account goes back to Recipient with the message', async () => {
    mockRouteParams = { recipientAccount: '1087654321', amountCentavos: 50000 };
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText("You're sending")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 5678. Change account' })
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: /^Checking •• 4321/ })[0]
    );
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getByText('Cannot transfer to the same account')).toBeTruthy();
    expect(executeTransfer).not.toHaveBeenCalled();
  });

  it('Review From change to an account with too little balance goes back to Amount', async () => {
    mockRouteParams = { recipientAccount: '1099999999', amountCentavos: 3000000 };
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText("You're sending")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 5678. Change account' })
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: /^Checking •• 4321/ })[0]
    );
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    expect(
      screen.getByText('Insufficient funds in selected source account')
    ).toBeTruthy();
  });

  it('uses a new idempotency key after switching the source account on Review', async () => {
    await render(<TransferScreen />);
    await chooseSource();
    expect(await screen.findByText("You're sending")).toBeTruthy();
    const results = jest.mocked(generateIdempotencyKey).mock.results;
    const keyBefore = results[results.length - 1].value;
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 5678. Change account' })
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: /^Checking •• 4321/ })[0]
    );
    expect(screen.getByText('Checking •• 4321')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));
    });
    const submitted = jest.mocked(executeTransfer).mock.calls[0][1];
    expect(submitted.from_account).toBe('acc-3333-4444');
    expect(submitted.idempotency_key).not.toBe(keyBefore);
  });

  it('two presses in the same frame on Schedule start one prompt and one RPC', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [initialAccounts[0]], error: null });
    mockRouteParams = { recipientAccount: '1099999999' };
    const { supabase } = jest.requireMock('../lib/supabase');
    jest.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === 'create_scheduled_transfer_to_number') {
        return Promise.resolve({
          data: {
            id: '8f043910-1234-4567-8901-123456789012',
            amount: 12345,
            next_run_date: '2026-11-10',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    await render(<TransferScreen />);
    await screen.findByText('Step 2 of 3');
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const button = screen.getByRole('button', { name: 'Schedule ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(
      screen.getByRole('header', { name: 'Transfer scheduled for Nov 10' })
    ).toBeTruthy();
    expect(screen.getByText('₱123.45')).toBeTruthy();
    expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(
      jest
        .mocked(supabase.rpc)
        .mock.calls.filter(
          ([fn]: [string]) => fn === 'create_scheduled_transfer_to_number'
        )
    ).toHaveLength(1);
  });

  // ---- 266e55a follow-ups ----

  it('lets a prefilled transfer to the default account continue from another account', async () => {
    // Recipient is the first (default) account; paying from Checking is valid.
    mockRouteParams = {
      recipientAccount: '1012345678',
      recipientNickname: 'Savings pot',
    };
    await render(<TransferScreen />);
    await chooseSource(/^Checking •• 4321/);
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    expect(screen.getByLabelText('To Savings pot · •• 5678')).toBeTruthy();
    expect(screen.queryByText('Cannot transfer to the same account')).toBeNull();
  });

  it('drops the prefill nickname when the recipient is invalid', async () => {
    mockRouteParams = { recipientAccount: '123', recipientNickname: 'Mama' };
    await render(<TransferScreen />);
    expect(
      await screen.findByText('Invalid QR recipient account: must be exactly 10 digits.')
    ).toBeTruthy();
    expect(screen.queryByText(/Mama/)).toBeNull();
  });

  it('two presses in the same frame on Send start one prompt and one transfer', async () => {
    await render(<TransferScreen />);
    await chooseSource();
    const button = await screen.findByRole('button', { name: 'Send ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(executeTransfer).toHaveBeenCalledTimes(1);
  });
});
