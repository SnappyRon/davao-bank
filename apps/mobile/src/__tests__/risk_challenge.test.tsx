jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => async () => ({ success: true }),
}));
jest.mock('../components/StepUpSetupLink', () => ({ StepUpSetupLink: () => null }));
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    toggleHideBalance: jest.fn(),
    confirmBiometricPayment: jest.fn().mockResolvedValue({ success: true }),
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TransferScreen } from '../screens/TransferScreen';
import { executeTransfer, fetchAccountBalances } from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import type { AccountBalance } from '@davao-bank/shared';

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

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [] }),
    })),
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    executeTransfer: jest.fn(),
    generateIdempotencyKey: jest.fn(actual.generateIdempotencyKey),
    fetchAccountBalances: jest.fn(),
  };
});

async function chooseSource(name: RegExp = /^Savings •• 5678/) {
  await fireEvent.press(await screen.findByRole('button', { name }));
}

describe('RiskChallengeSheet integration in TransferScreen (Stage 8F)', () => {
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
      balance: 10000000, // ₱100,000.00
      ledger_entry_count: 8,
      last_activity_at: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {
      recipientAccount: '1099999999',
      amountCentavos: 50000,
      note: 'Lunch split',
    };
    jest
      .mocked(fetchAccountBalances)
      .mockResolvedValue({ data: initialAccounts, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('handles "Confirmation required" by displaying challenge sheet, confirming, and repeating transfer with same key', async () => {
    let transferAttempts = 0;
    let firstKey = '';

    jest.mocked(executeTransfer).mockImplementation(async (_sb, params) => {
      transferAttempts++;
      if (transferAttempts === 1) {
        firstKey = params.idempotency_key;
        return {
          data: null,
          error: 'Confirmation required: flagged by Bantay risk assessment',
        };
      }
      expect(params.idempotency_key).toBe(firstKey);
      return {
        data: {
          id: 'tx-12345',
          transaction_id: 'tx-12345',
          reference: 'DB-TXMO-CK12',
          type: 'transfer' as const,
          amount: 50000,
          status: 'completed' as const,
          idempotency_key: firstKey,
          idempotent_replay: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    });

    await render(<TransferScreen />);
    await chooseSource();

    expect(await screen.findByText("You're sending")).toBeTruthy();

    // Trigger Send
    await fireEvent.press(screen.getByRole('button', { name: 'Send ₱500.00' }));

    // Challenge sheet appears
    expect(await screen.findByText('Confirmation required')).toBeTruthy();
    expect(
      screen.getByText(
        'This payment has been flagged for review. Confirm it’s you to authorize.'
      )
    ).toBeTruthy();

    // Press Confirm in the challenge sheet
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

    // verify confirm_risky_payment was called with the exact idempotency key
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('confirm_risky_payment', {
        p_idempotency_key: firstKey,
      })
    );

    // Verify the transfer succeeded on retry
    expect(await screen.findByText('Transfer sent')).toBeTruthy();
    expect(executeTransfer).toHaveBeenCalledTimes(2);
  });

  it('cancels challenge sheet and sets "Not authorized. Nothing was sent."', async () => {
    jest.mocked(executeTransfer).mockResolvedValueOnce({
      data: null,
      error: 'Confirmation required: risky payment',
    });

    await render(<TransferScreen />);
    await chooseSource();

    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));

    expect(await screen.findByText('Confirmation required')).toBeTruthy();

    // Press Cancel
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    // Sheet dismissed, copy matches Phase 7 wording standard
    expect(await screen.findByText('Not authorized. Nothing was sent.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('confirm_risky_payment', expect.anything());
  });

  it('locks account when user taps "Not me — lock account" on challenge sheet', async () => {
    jest.mocked(executeTransfer).mockResolvedValueOnce({
      data: null,
      error: 'Confirmation required: flagged payment',
    });

    await render(<TransferScreen />);
    await chooseSource();

    await fireEvent.press(await screen.findByRole('button', { name: 'Send ₱500.00' }));

    expect(await screen.findByText('Confirmation required')).toBeTruthy();

    // Press "Not me — lock account"
    await fireEvent.press(screen.getByRole('button', { name: 'Not me — lock account' }));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('lock_my_account', undefined)
    );
  });
});
