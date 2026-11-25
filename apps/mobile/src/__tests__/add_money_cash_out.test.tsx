jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import {
  executeDeposit,
  executeWithdraw,
  fetchAccountBalances,
  type AccountBalance,
  type MoneyOperationResult,
} from '@davao-bank/shared';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@davao-bank/shared', () => ({
  ...jest.requireActual('@davao-bank/shared'),
  fetchAccountBalances: jest.fn(),
  executeDeposit: jest.fn(),
  executeWithdraw: jest.fn(),
}));
const mockConfirmBiometricPayment = jest.fn();
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

import * as featureAccounts from '../hooks/useFeatureAccounts';
import { AddMoneyScreen } from '../screens/AddMoneyScreen';
import { CashOutScreen } from '../screens/CashOutScreen';

const account = (
  id: string,
  num: string,
  type: AccountBalance['type'],
  balance: number
): AccountBalance => ({
  account_id: id,
  user_id: 'u',
  account_number: num,
  type,
  currency: 'PHP',
  status: 'active',
  balance,
  ledger_entry_count: 0,
  last_activity_at: null,
});
const SAVINGS = account('acc-s', '1012348921', 'savings', 500000);
const CHECKING = account('acc-c', '1087654321', 'checking', 200000);

function pending<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Add money and Cash out (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
  });

  it('Add money: no account step with one account, Review card, "Add ₱500.00" → "Adding…"', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    const call = pending<Awaited<ReturnType<typeof executeDeposit>>>();
    jest.mocked(executeDeposit).mockReturnValue(call.promise);
    await render(<AddMoneyScreen />);
    expect(await screen.findByLabelText('To Savings •• 8921')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    // The pre-filled "Online Top-up" note is gone.
    expect(screen.queryByDisplayValue('Online Top-up')).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText("You're adding")).toBeTruthy();
    expect(screen.getByText('₱500.00')).toBeTruthy();
    expect(screen.getByText('Simulated money — no real funds move.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Add ₱500.00' }));
    });
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeTruthy();
    expect(jest.mocked(executeDeposit).mock.calls[0][1]).toEqual({
      account: 'acc-s',
      amount: 50000,
      idempotency_key: expect.any(String),
      reference: 'Online Cash-in',
    });
    await act(async () => {
      call.resolve({ data: null, error: 'boom' });
    });
  });

  it.each([
    ['Add', 'Money added', 'deposit'],
    ['Cash out', 'Cash-out complete', 'withdrawal'],
  ] as const)(
    '%s result uses the response amount and masked account',
    async (action, title, type) => {
      jest
        .mocked(fetchAccountBalances)
        .mockResolvedValue({ data: [SAVINGS], error: null });
      const data: MoneyOperationResult = {
        id: '8f043910-1234-4567-8901-123456789012',
        type,
        status: 'completed',
        amount: 12345,
        account_number: '1012348921',
        reference: '',
        idempotency_key: 'key',
        created_at: '2026-11-10T00:00:00Z',
        idempotent_replay: false,
      };
      if (type === 'deposit')
        jest.mocked(executeDeposit).mockResolvedValue({ data, error: null });
      else jest.mocked(executeWithdraw).mockResolvedValue({ data, error: null });
      await render(type === 'deposit' ? <AddMoneyScreen /> : <CashOutScreen />);
      await screen.findByLabelText(
        type === 'deposit' ? 'To Savings •• 8921' : 'From Savings •• 8921'
      );
      await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      await fireEvent.press(screen.getByRole('button', { name: `${action} ₱500.00` }));
      expect(await screen.findByRole('header', { name: title })).toBeTruthy();
      expect(screen.getByText('₱123.45')).toBeTruthy();
      expect(screen.getByText('•• 8921')).toBeTruthy();
      expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
    }
  );

  it('Add money: inline amount validation', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<AddMoneyScreen />);
    await screen.findByLabelText('To Savings •• 8921');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Amount must be greater than ₱0.00')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('Cash out: account step first with 2+ accounts, then "Cash out ₱500.00" → "Cashing out…"', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [SAVINGS, CHECKING], error: null });
    const call = pending();
    jest.mocked(executeWithdraw).mockReturnValue(call.promise as never);
    await render(<CashOutScreen />);
    expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByText('Cash out from')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    expect(screen.getByLabelText('From Checking •• 4321')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText("You're cashing out")).toBeTruthy();
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cash out ₱500.00' }));
    });
    expect(screen.getByRole('button', { name: 'Cashing out…' })).toBeTruthy();
    expect(mockConfirmBiometricPayment).toHaveBeenCalledWith({
      title: 'Authorize cash out',
      message: 'Confirm cash-out of ₱500.00 from account •• 4321',
    });
    expect(jest.mocked(executeWithdraw).mock.calls[0][1]).toEqual({
      account: 'acc-c',
      amount: 50000,
      idempotency_key: expect.any(String),
      reference: 'ATM Withdrawal',
    });
    await act(async () => {
      call.resolve({ data: null, error: 'boom' });
    });
  });

  it('Cash out: cancelled authorization moves no money', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    mockConfirmBiometricPayment.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await render(<CashOutScreen />);
    await screen.findByLabelText('From Savings •• 8921');
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cash out ₱500.00' }));
    });
    expect(executeWithdraw).not.toHaveBeenCalled();
    expect(screen.getByText('Not authorized. Nothing was sent.')).toBeTruthy();
  });

  // ---- 7B.4 fix round ----

  it('waits for late accounts without showing ₱0.00, then starts on the account step once', async () => {
    let resolve!: (v: unknown) => void;
    jest.mocked(fetchAccountBalances).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }) as never
    );
    await render(<CashOutScreen />);
    expect(screen.getByText('Loading accounts…')).toBeTruthy();
    expect(screen.queryByText(/Available/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    await act(async () => {
      resolve({ data: [SAVINGS, CHECKING], error: null });
    });
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Savings •• 8921/ }));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
  });

  it('shows the load error with Try again and never ₱0.00', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValueOnce({ data: null, error: 'Network request failed' })
      .mockResolvedValueOnce({ data: [SAVINGS], error: null });
    await render(<AddMoneyScreen />);
    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();
    expect(screen.queryByText(/Available/)).toBeNull();
    expect(screen.queryByText('₱0.00')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('To Savings •• 8921')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('two presses in the same frame start one cash-out', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    const call = pending<Awaited<ReturnType<typeof executeWithdraw>>>();
    jest.mocked(executeWithdraw).mockReturnValue(call.promise);
    await render(<CashOutScreen />);
    await screen.findByLabelText('From Savings •• 8921');
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const button = screen.getByRole('button', { name: 'Cash out ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(executeWithdraw).toHaveBeenCalledTimes(1);
    await act(async () => {
      call.resolve({ data: null, error: 'boom' });
    });
  });

  it('two presses in the same frame start one deposit', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    const call = pending<Awaited<ReturnType<typeof executeDeposit>>>();
    jest.mocked(executeDeposit).mockReturnValue(call.promise);
    await render(<AddMoneyScreen />);
    await screen.findByLabelText('To Savings •• 8921');
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const button = screen.getByRole('button', { name: 'Add ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(executeDeposit).toHaveBeenCalledTimes(1);
    await act(async () => {
      call.resolve({ data: null, error: 'boom' });
    });
  });

  it('a later account reload does not move the step again', async () => {
    let reloadAccounts!: () => Promise<void>;
    const origHook = featureAccounts.useFeatureAccounts;
    const spy = jest
      .spyOn(featureAccounts, 'useFeatureAccounts')
      .mockImplementation(() => {
        const res = origHook();
        reloadAccounts = res.loadAccounts;
        return res;
      });

    try {
      const secondLoad = pending<Awaited<ReturnType<typeof fetchAccountBalances>>>();
      jest
        .mocked(fetchAccountBalances)
        .mockResolvedValueOnce({ data: [SAVINGS, CHECKING], error: null })
        .mockReturnValueOnce(secondLoad.promise);

      await render(<CashOutScreen />);
      expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
      await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('Step 3 of 3')).toBeTruthy();
      expect(screen.getByText('Checking •• 4321')).toBeTruthy();

      // Trigger a real second loadAccounts while on the review step;
      // second fetchAccountBalances is deferred and resolves while on review.
      let reloadPromise: Promise<void> | undefined;
      await act(async () => {
        reloadPromise = reloadAccounts();
      });

      await act(async () => {
        secondLoad.resolve({ data: [SAVINGS, CHECKING], error: null });
        await reloadPromise;
      });

      expect(fetchAccountBalances).toHaveBeenCalledTimes(2);
      // The first-step decision is not taken again: step and selected account stay unchanged.
      expect(screen.getByText('Step 3 of 3')).toBeTruthy();
      expect(screen.getByText('Checking •• 4321')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
