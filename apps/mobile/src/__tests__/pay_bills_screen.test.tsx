jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { fetchAccountBalances, type AccountBalance } from '@davao-bank/shared';

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

const BILLER = {
  id: 'biller-1',
  name: 'Apo Fiber Internet (demo)',
  category: 'internet',
  reference_label: 'Subscriber No.',
  reference_pattern: '^[0-9]{10}$',
  is_active: true,
};
const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [BILLER], error: null }),
    })),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  },
}));
jest.mock('@davao-bank/shared', () => ({
  ...jest.requireActual('@davao-bank/shared'),
  fetchAccountBalances: jest.fn(),
}));
const mockConfirmBiometricPayment = jest.fn();
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

import { PayBillsScreen } from '../screens/PayBillsScreen';

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

async function goToReference() {
  await fireEvent.press(await screen.findByRole('button', { name: /Apo Fiber/ }));
}

describe('PayBillsScreen (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    mockRpc.mockResolvedValue({ data: { id: 'tx-1' }, error: null });
  });

  it('has 5 steps with 2+ accounts: account, biller, reference, amount & when, review', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [SAVINGS, CHECKING], error: null });
    await render(<PayBillsScreen />);
    expect(await screen.findByText('Step 1 of 5')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    expect(screen.getByText('Step 2 of 5')).toBeTruthy();
    await goToReference();
    expect(screen.getByText('Step 3 of 5')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    // Amount and When on one step.
    expect(screen.getByText('Step 4 of 5')).toBeTruthy();
    expect(screen.getByLabelText('To Apo Fiber Internet (demo)')).toBeTruthy();
    expect(screen.getByText('When')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1250');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Step 5 of 5')).toBeTruthy();
    expect(screen.getByText("You're paying")).toBeTruthy();
    expect(screen.getByText('Checking •• 4321')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱1,250.00' }));
    });
    expect(screen.getByRole('header', { name: 'Bill paid' })).toBeTruthy();
    expect(screen.getByText('DB-TX1')).toBeTruthy();
    expect(mockConfirmBiometricPayment).toHaveBeenCalledWith({
      title: 'Authorize Bill Payment',
      message: 'Confirm payment of ₱1,250.00 to Apo Fiber Internet (demo)',
    });
    expect(mockRpc).toHaveBeenCalledWith('pay_bill', {
      p_from_account: 'acc-c',
      p_biller_id: 'biller-1',
      p_biller_reference: '1234567890',
      p_amount: 125000,
      p_idempotency_key: expect.any(String),
    });
  });

  it('has 4 steps with one account and no account step', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PayBillsScreen />);
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy();
    expect(screen.queryByText('Pay from')).toBeNull();
  });

  it('shows a helper example for the reference, never the regex', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PayBillsScreen />);
    await goToReference();
    expect(screen.getByText('e.g. 10 digits, on your bill')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '12ab');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByText('Check the subscriber no.: e.g. 10 digits, on your bill')
    ).toBeTruthy();
    expect(screen.queryByText(/\[0-9\]|\^|\$$/)).toBeNull();
  });

  it('names a scheduled payment and shows "Scheduling…" while busy', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    let resolveRpc!: (v: unknown) => void;
    mockRpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve;
        })
    );
    await render(<PayBillsScreen />);
    await goToReference();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText("You're scheduling")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Schedule ₱500.00' }));
    });
    expect(screen.getByRole('button', { name: 'Scheduling…' })).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith(
      'create_scheduled_payment',
      expect.objectContaining({ p_kind: 'bill', p_amount: 50000, p_frequency: 'once' })
    );
    await act(async () => {
      resolveRpc({
        data: {
          id: '8f043910-1234-4567-8901-123456789012',
          amount: 12345,
          next_run_date: '2026-11-10',
        },
        error: null,
      });
    });
    expect(
      await screen.findByRole('header', { name: 'Bill payment scheduled for Nov 10' })
    ).toBeTruthy();
    expect(screen.getByText('₱123.45')).toBeTruthy();
    expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
  });

  // ---- 7B.4 fix round ----

  async function toReview(amount: string) {
    await goToReference();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), amount);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  }

  it('shows Not sent for a confirmed database rejection', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'insufficient funds' },
    });
    await render(<PayBillsScreen />);
    await toReview('500');
    await fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    expect(await screen.findByRole('header', { name: 'Not sent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('uses the shared When chips and preset amounts, and shows Balance after', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PayBillsScreen />);
    await goToReference();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    for (const name of ['Now', 'Later', 'Recurring']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Set amount to ₱2000' })).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1250');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Balance after')).toBeTruthy();
    expect(screen.getByText('₱3,750.00')).toBeTruthy();
  });

  it('Review From change to an account with too little balance goes back to Amount', async () => {
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [SAVINGS, CHECKING], error: null });
    await render(<PayBillsScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: /^Savings •• 8921/ })
    );
    await toReview('3000');
    expect(screen.getByText('Step 5 of 5')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 8921. Change account' })
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: /^Checking •• 4321/ })[0]
    );
    expect(screen.getByText('Step 4 of 5')).toBeTruthy();
    expect(screen.getByText('Amount exceeds available balance')).toBeTruthy();
    expect(mockConfirmBiometricPayment).not.toHaveBeenCalled();
  });

  it('two presses in the same frame on Schedule start one prompt and one RPC', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PayBillsScreen />);
    await goToReference();
    await fireEvent.changeText(screen.getByLabelText('Subscriber No.'), '1234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const button = screen.getByRole('button', { name: 'Schedule ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(
      mockRpc.mock.calls.filter(([fn]) => fn === 'create_scheduled_payment')
    ).toHaveLength(1);
  });

  it('two presses in the same frame on Pay start one prompt and one payment', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PayBillsScreen />);
    await toReview('500');
    const button = screen.getByRole('button', { name: 'Pay ₱500.00' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls.filter(([fn]) => fn === 'pay_bill')).toHaveLength(1);
  });
});
