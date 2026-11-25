jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  type AccountBalance,
  type PaymentRequest,
  type SavedRecipient,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
  useRoute: () => ({ params: undefined }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const REQUEST: PaymentRequest = {
  id: 'req-1',
  requester_id: 'other-user',
  requester_account: '7f3c2a10-1b2c-4d5e-8f90-123456789abc',
  payer_account_number: '1012348921',
  payer_user_id: 'u',
  amount: 50000,
  note: 'Lunch',
  status: 'pending',
  transaction_id: null,
  expires_at: '2026-11-17T00:00:00Z',
  created_at: '2026-11-10T00:00:00Z',
  responded_at: null,
};
const RECIPIENT: SavedRecipient = {
  id: 'rec-1',
  owner_id: 'u',
  account_number: '1099997943',
  nickname: 'Mama',
  created_at: '2026-11-01T00:00:00Z',
} as SavedRecipient;
const RECIPIENT_2: SavedRecipient = {
  id: 'rec-2',
  owner_id: 'u',
  account_number: '1099990001',
  nickname: 'Landlord',
  created_at: '2026-11-01T00:00:00Z',
} as SavedRecipient;

const mockRpc = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
let mockRequests: PaymentRequest[] = [];
jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
    from: (table: string) => {
      if (table === 'payment_requests') {
        return {
          select: () => ({
            eq: (col: string) => ({
              order: () =>
                Promise.resolve({
                  data: col === 'payer_user_id' ? mockRequests : [],
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [RECIPIENT, RECIPIENT_2], error: null }),
        }),
        update: (values: unknown) => {
          mockUpdate(values);
          return {
            eq: (col: string, val: string) => {
              mockUpdateEq(col, val);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
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

import { PaymentRequestsScreen } from '../screens/PaymentRequestsScreen';
import { SavedRecipientsScreen } from '../screens/SavedRecipientsScreen';

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

describe('Pay a request (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequests = [REQUEST];
    mockConfirmBiometricPayment.mockResolvedValue({ success: true });
    mockRpc.mockResolvedValue({ data: null, error: null });
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: [SAVINGS, CHECKING], error: null });
  });

  it('opens the standard Review with a source picker, masks the prompt, keeps the RPC payload', async () => {
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    // Review before any authorization.
    expect(mockConfirmBiometricPayment).not.toHaveBeenCalled();
    expect(screen.getByText("You're paying")).toBeTruthy();
    expect(screen.getByText('Simulated money — no real funds move.')).toBeTruthy();
    // Change the source account in the picker sheet.
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 8921. Change account' })
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    expect(screen.getByText('Checking •• 4321')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    const prompt = mockConfirmBiometricPayment.mock.calls[0][0];
    expect(prompt.message).toContain('•• 4321');
    expect(prompt.message).not.toContain(REQUEST.requester_account);
    expect(prompt.message).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(mockRpc).toHaveBeenCalledWith('pay_payment_request', {
      p_request_id: 'req-1',
      p_from_account: 'acc-c',
      p_idempotency_key: expect.any(String),
    });
  });

  it('does not pay when authorization is cancelled and keeps Review open with the account', async () => {
    mockConfirmBiometricPayment.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'From: Savings •• 8921. Change account' })
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Checking •• 4321/ }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    expect(mockRpc).not.toHaveBeenCalledWith('pay_payment_request', expect.anything());
    expect(screen.getByText("You're paying")).toBeTruthy();
    expect(screen.getByText('Checking •• 4321')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not authorized. Nothing was sent.'
    );
  });

  it('keeps Review open with an inline error when the server fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network request failed' },
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    expect(screen.getByText("You're paying")).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows a result and returns to the list after paying', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        transfer_result: {
          id: '8f043910-1234-4567-8901-123456789012',
          amount: 32100,
          to_account: '1099997943',
        },
      },
      error: null,
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    expect(screen.queryByText("You're paying")).toBeNull();
    expect(screen.getByRole('header', { name: 'Payment sent' })).toBeTruthy();
    expect(screen.getByText('₱321.00')).toBeTruthy();
    expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText("You're paying")).toBeNull();
    expect(screen.queryByText(/!/)).toBeNull();
  });

  it('blocks paying from an account with too little balance', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [account('acc-s', '1012348921', 'savings', 10000)],
      error: null,
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    expect(screen.getByText(/Not enough balance in Savings •• 8921/)).toBeTruthy();
    const pay = screen.getByRole('button', { name: 'Pay ₱500.00' });
    expect(pay.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(pay);
    });
    expect(mockConfirmBiometricPayment).not.toHaveBeenCalled();
  });

  it('two presses in the same frame start one prompt and one RPC', async () => {
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    const pay = screen.getByRole('button', { name: 'Pay ₱500.00' });
    await act(async () => {
      fireEvent.press(pay);
      fireEvent.press(pay);
    });
    expect(mockConfirmBiometricPayment).toHaveBeenCalledTimes(1);
    expect(
      mockRpc.mock.calls.filter(([fn]) => fn === 'pay_payment_request')
    ).toHaveLength(1);
  });

  it('shows Balance after on Review', async () => {
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    expect(screen.getByText('Balance after')).toBeTruthy();
    expect(screen.getByText('₱4,500.00')).toBeTruthy();
  });

  it('has no account picker with one account', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    expect(screen.getByText('Savings •• 8921')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change account/ })).toBeNull();
  });

  it('clears an older "Paid" banner when Decline or Cancel request is pressed', async () => {
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    expect(screen.getByRole('header', { name: 'Payment sent' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByText('Paid ₱500.00.')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith(
      'decline_payment_request',
      expect.anything()
    );
  });

  it('leaves Balance after out of Review when the account is short', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [account('acc-s', '1012348921', 'savings', 10000)],
      error: null,
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    expect(screen.queryByText('Balance after')).toBeNull();
  });
});

describe('Saved recipients (spec 7B.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renames inline with 1–40 character validation and the same update query', async () => {
    await render(<SavedRecipientsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Rename Mama' }));
    const field = screen.getByDisplayValue('Mama');
    await fireEvent.changeText(field, '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Nickname must be 1 to 40 characters.')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    await fireEvent.changeText(field, '  Nanay  ');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockUpdate).toHaveBeenCalledWith({ nickname: 'Nanay' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'rec-1');
  });

  it('ignores renaming another row while an edit has unsaved changes', async () => {
    await render(<SavedRecipientsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Rename Mama' }));
    await fireEvent.changeText(screen.getByDisplayValue('Mama'), 'Nanay');
    await fireEvent.press(screen.getByRole('button', { name: 'Rename Landlord' }));
    expect(screen.getByDisplayValue('Nanay')).toBeTruthy();
    expect(screen.queryByDisplayValue('Landlord')).toBeNull();
  });

  it('Cancel closes the inline field without saving', async () => {
    await render(<SavedRecipientsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Rename Mama' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByDisplayValue('Mama')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('tapping a recipient opens Transfer pre-filled', async () => {
    await render(<SavedRecipientsScreen />);
    expect(await screen.findByText('•• 7943')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send money to Mama, •• 7943' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('Transfer', {
      recipientAccount: '1099997943',
      recipientNickname: 'Mama',
    });
  });
});
