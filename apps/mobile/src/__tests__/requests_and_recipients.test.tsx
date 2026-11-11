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
          order: () => Promise.resolve({ data: [RECIPIENT], error: null }),
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

  it('does not pay when authorization is cancelled', async () => {
    mockConfirmBiometricPayment.mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay ₱500.00' }));
    });
    expect(mockRpc).not.toHaveBeenCalledWith('pay_payment_request', expect.anything());
  });

  it('has no account picker with one account', async () => {
    jest.mocked(fetchAccountBalances).mockResolvedValue({ data: [SAVINGS], error: null });
    await render(<PaymentRequestsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Pay ₱500.00' }));
    expect(screen.getByText('Savings •• 8921')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change account/ })).toBeNull();
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
    });
  });
});
